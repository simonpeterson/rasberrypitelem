#!/usr/bin/python

import BaseHTTPServer
import SocketServer
from Queue import *
import time
import threading
import os
import json
import pprint
import sys
import argparse
import webbrowser
import urlparse
import serial
import cgi
from pycrc.crc_algorithms import Crc
import binascii
import cobs

latest_packet = {}
new_packet_cv = threading.Condition()
interface = None
logger = None

def uint8(word):
        return ord(word);

def uint16(word):
        return (ord(word[0]) << 8) + ord(word[1])
        
def uint32(word):
        return (ord(word[0]) << 24) + (ord(word[1]) << 16) + (ord(word[2]) << 8) + ord(word[3])

class DecodeError(Exception):
    pass
    
class DigiPacketizer:
    def __init__(self):
        self.crc = Crc(width = 16, poly = 0x8005,
            reflect_in = True, xor_in = 0x0000,
            reflect_out = True, xor_out = 0x0000)
        
    def checksum(self, txt):
        return self.crc.table_driven(txt)
    
    def decode(self, txt):
        p = Packet()
        decoded = txt
        
        
        if decoded[3] != '\x90': return None
        length = ord(decoded[1]) + ord(decoded[2])
        #print "length: %d" % (length)
        data = decoded[15:-1]
        #print ''.join( [ "%02X " % ord( x ) for x in data ] ).strip()
        crc = self.checksum(data[0:-2])
        crc_check = uint16(data[-2:])
        #print "%02X, %02X" % (crc, crc_check)
        if crc != crc_check:
            raise DecodeError("CRC mismatch")
        
        p.rtr = uint8(decoded[0]) & 0x40 != 0
        p.id = uint16(data[0:2]) & 0x7ff
        p.data = [uint8(x) for x in data[2:-2]]
        return p
        
    def encode(self, packet):
        REMOTE_ADDR = [0x00,0x00,0x00,0x00,0x00,0x00,0xFF,0xFF]
        out = [0x10,0x01]
        out.extend(REMOTE_ADDR)
        out.extend([0xFF,0xFE,0x00,0x00])
        pkt = []
        pkt.append((int(packet.rtr) << 6) | ((packet.id & 0x700) >> 8))
        pkt.append(packet.id & 0xff)
        pkt.extend(packet.data)
        pkt_enc = [chr(x) for x in pkt]
        crc = self.checksum(pkt_enc)
        
        out.extend(pkt)
        out.append((crc & 0xff00)>>8 )
        out.append( crc & 0xff )
        print out
        out = [chr(x) for x in out]
        print out
        encoded = self.xbee_get_frame_xmit(''.join(out))
        return encoded
    """Appends 7E to the beginning, and adds the checksum"""
    def xbee_get_frame_xmit(self, bytes):
        length = len(bytes)
        out = []
        out.append(chr((length >> 8) & 0xFF))
        out.append(chr(length & 0xFF))
        checksum = 0
        for byte in bytes:
            out.append(byte)
            checksum += ord(byte)
        checksum = chr(0xFF - (checksum & 0xFF))
        out.append(checksum)
        
        out2 = ['\x7E']
        for byte in out:
            if byte in ('\x7E','\x7D','\x11','\x13'):
                out2.append('\x7D')
                out2.append(chr(ord(byte) ^ 0x20))
            else:
                out2.append(byte)
        return ''.join(out2)
    
class CANPacketizer:
    def __init__(self):
        self.crc = Crc(width = 16, poly = 0x8005,
            reflect_in = True, xor_in = 0x0000,
            reflect_out = True, xor_out = 0x0000)
        
    def checksum(self, txt):
        return self.crc.table_driven(txt)
    
    def decode(self, txt):
        if txt[-1] == '\x00':
            txt = txt[:-1]
        p = Packet()
        decoded = cobs.decode(txt)
        # print ''.join( [ "%02X " % ord( x ) for x in decoded ] ).strip()
        crc = self.checksum(decoded[0:-2])
        crc_check = uint16(decoded[-2:])
        if crc != crc_check:
            raise DecodeError("CRC mismatch")
        p.rtr = uint8(decoded[0]) & 0x40 != 0
        p.id = uint16(decoded[0:2]) & 0x7ff
        p.data = [uint8(x) for x in decoded[2:-2]]
        return p
        
    def encode(self, packet):
        out = []
        out.append((int(packet.rtr) << 6) | ((packet.id & 0x700) >> 8))
        out.append(packet.id & 0xff)
        out.extend(packet.data)
        out = [chr(x) for x in out]
        crc = self.checksum(out)
        out.append(chr( (crc & 0xff00)>>8 ))
        out.append(chr( crc & 0xff ))
        encoded = cobs.encode(''.join(out))
        encoded += '\x00'
        return encoded

def h(x):
    print binascii.hexlify(x)

class PacketBus():
        def __init__(self):
                self.listeners = []
        def register(self):
                queue = Queue()
                self.listeners.append(queue)
                return queue
        def unregister(self, queue):
                self.listeners.remove(queue)
        def send(self, packet):
                for listener in self.listeners:
                        listener.put(packet)

bus = PacketBus()

class ThreadingHTTPServer(SocketServer.ThreadingMixIn, BaseHTTPServer.HTTPServer):
        pass

class Packet:
        def __init__(self):
                self.rtr = False
                self.id = 0
                self.data = []

def new_packet(packet):
        new_packet_cv.acquire()
        latest_packet[packet.id] = packet
        new_packet_cv.notify_all()
        new_packet_cv.release()
        if logger != None:
                logger.send(packet)
        #pprint.pprint(packet)
        bus.send(packet)
                
class InterfaceNull(threading.Thread):
        def __init(self):
                threading.Thread.__init(self)
        def run(self):
                pass
        def send(self, packet):
                pass
        def stop(self):
                pass

class InterfaceETelemetry(threading.Thread):
    def __init__(self, _filename):
        threading.Thread.__init__(self)
        self.filename = _filename
        self.packetizer = DigiPacketizer()
    def run(self):
        self.end_thread = False
        self.ser = serial.Serial(self.filename, 115200, timeout=1)
        while 1:
            if self.end_thread == True:
                break
            try:
                byte = None
                bytes = []
                while byte != '\x7e':
                    byte = self.ser.read(1)
                    if byte == '\x7d':
                        byte = chr(ord(self.ser.read(1)) ^ 0x20)
                    bytes.append(byte)
                bytes = ['\x7e'] + bytes[:-1]
                stream = ''.join(bytes)
                packet = self.packetizer.decode(stream)
                packet.time = time.time()
                new_packet(packet)
            except DecodeError as e:
                print "Malformed E packet:",e
                continue
            except:
                continue
    def send(self, packet):
        encoded = self.packetizer.encode(packet)
        self.ser.write(encoded)
    def stop(self):
        self.end_thread = True
        
class InterfaceC3Telemetry(threading.Thread):
        def __init__(self, _filename):
                threading.Thread.__init__(self)
                self.filename = _filename
                self.packetizer = CANPacketizer()
        def run(self):
                self.end_thread = False
                self.ser = serial.Serial(self.filename, 115200, timeout=1)
                while 1:
                        if self.end_thread == True:
                                break
                        try:
                                byte = None
                                bytes = []
                                while byte != '\x00':
                                        byte = self.ser.read(1)
                                        bytes.append(byte)
                                stream = ''.join(bytes)
                                packet = self.packetizer.decode(stream)
                                packet.time = time.time()
                                new_packet(packet)
                        except DecodeError as e:
                                print "malformed C3 packet at time",e, packet.time,''.join( [ "%02X " % ord( x ) for x in stream ] ).strip()
                                continue
                        except:
                                continue
        def send(self, packet):
                encoded = self.packetizer.encode(packet)
                self.ser.write(encoded)
        def stop(self):
                self.end_thread = True
                
class InterfaceC2Telemetry(threading.Thread):
    def __init__(self, _filename):
        threading.Thread.__init__(self)
        self.filename = _filename
    def run(self):
        self.end_thread = False
        self.ser = serial.Serial(self.filename, 115200, timeout=1)
        while 1:
            if self.end_thread == True:
                break
            try:
                line = self.ser.readline().strip()
                if line == '':
                    continue
                packet = Packet()
                packet.time = time.time()
                try:
                    packet.id = int(line[0:3],16)
                    packet.data = []
                    for i in xrange(3, len(line), 2):
                        packet.data.append(int(line[i:i+2],16))
                    #packet.data = map(lambda x: int(x,16),re.findall(r".{2}",line[3:]))
                except ValueError:
                    print 'malformed packet at time', packet.time
                    continue
                new_packet(packet)
            except serial.SerialTimeoutException:
                continue
            except OSError:
                print "Serial OSError"
                continue  
        self.ser.close()
    def send(self, packet):
        self.ser.write('%03X' % packet.id)
        sys.stdout.write('%03X' % packet.id)
        for data in packet.data:
            self.ser.write('%02X' % data)
            sys.stdout.write('%02X' % data)
        self.ser.write('\n')
        sys.stdout.write('\n')
    def stop(self):
        self.end_thread = True

class InterfaceC2Log(threading.Thread):
        def __init__(self, _filename):
                threading.Thread.__init__(self)
                self.filename = _filename
        def run(self):
                self.end_thread = False
                f = open(self.filename,'r')
                offset = None
                for line in f:
                        if self.end_thread == True:
                                return
                        line = line.strip().split(' ')
                        if line[0] == '':
                                continue
                        if line[1] == '':
                                continue
                        packet = Packet()
                        packet.time = float(line[0])
                        if not offset:
                                offset = time.time() - packet.time
                        try:
                                packet.id = int(line[1][0:3],16)
                                packet.data = [int(line[1][i:i+2], 16) for i in xrange(3,len(line[1]),2)]
                        except ValueError:
                                print 'malformed packet at time', packet.time
                                continue
                        new_packet(packet)
                        delta = offset + packet.time - time.time()
                        if delta > 0:
                                time.sleep(delta)
                f.close()
                print "Done sending logged packets"
        def send(self, packet):
                pass
        def stop(self):
                self.end_thread = True

class Logger:
        def __init__(self, _filename):
                self.filename = _filename
                self.f = open(self.filename,'a')
        def send(self, packet):
                self.f.write('%.3f ' % time.time())
                self.f.write('%03X' % packet.id)
                for data in packet.data:
                        self.f.write('%02X' % data)
                self.f.write('\n')

class TelemetryHTTPHandler(BaseHTTPServer.BaseHTTPRequestHandler):
        def do_GET(self):
                url = urlparse.urlparse(self.path)
                query = urlparse.parse_qs(url.query)
                if url.path == '/magic/time':
                        self.send_response(200)
                        self.send_header('Content-type', 'text/plain')
                        self.end_headers()
                        # time.sleep(0.01)
                        self.wfile.write(time.time())
                elif url.path == '/magic/replay/stop':
                        self.send_response(200)
                        self.end_headers()
                        if interface != None:
                                interface.stop()
                elif url.path == '/magic/latest_packet':
                        self.send_response(200)
                        self.send_header('Content-type', 'application/json')
                        self.end_headers()
                        if 'id' in query and query['id'] != '':
                                new_packet_cv.acquire()
                                if 'longpoll' in query:
                                        if 'time' in query:
                                                if latest_packet[int(query['id'][0])].time <= (float(query['time'][0]) + 0.001):
                                                        print "------ HIT ---------- \n"
                                                        new_packet_cv.wait(1)
                                                else:
                                                        print "++ MISS ++ MISS ++ MISS ++\n"
                                        else:
                                                new_packet_cv.wait(1)
                                try:
                                        json.dump(latest_packet[int(query['id'][0])].__dict__, self.wfile)
                                except IOError:
                                        print 'IOError in dumping packet\n'
                                new_packet_cv.release()
                elif url.path == '/magic/latest_packets':
                        self.send_response(200)
                        self.send_header('Content-type', 'application/json')
                        self.end_headers()
                        packets_to_send = {}
                        if 'id' in query:
                                for packetid in query['id']:
                                        if int(packetid) in latest_packet:
                                                packets_to_send[int(packetid)] = latest_packet[int(packetid)].__dict__
                        else:
                                packets_to_send = map(lambda x: latest_packet[x].__dict__,latest_packet)
                        json.dump(packets_to_send, self.wfile)
                elif url.path == '/magic/json_source':
                        self.send_response(200)
                        self.send_header('Content-type', 'text/event-stream')
                        self.end_headers()
                        queue = bus.register()
                        try:
                                while 1:
                                        packet = queue.get()
                                        #try: packet.json
                                        #except: packet.json = json.dumps(packet.__dict__)
                                        self.wfile.write('retry: 250\n')
                                        self.wfile.write('data: ')
                                        self.wfile.write(json.dumps(packet.__dict__)) #for some reason this is much faster than json.dump
                                        self.wfile.write('\n\n')
                        except IOError:
                                bus.unregister(queue)
                else:
                        mimetype = 'text/html'
                        try:
                                if url.path == '/':
                                        f = open(os.curdir + os.sep + '/www/index.html')
                                else:
                                        ext = url.path.split('.')[-1]
                                        if ext == 'png':
                                                mimetype = 'image/png'
                                        elif ext == 'gif':
                                                mimetype = 'image/gif'
                                        elif ext == 'js':
                                                mimetype = 'application/javascript'
                                        elif ext == 'css':
                                                mimetype = 'text/css'
                                        f = open(os.curdir + os.sep + 'www' + url.path, 'rb')
                                        print os.curdir + os.sep + 'www' + url.path
                        except IOError:
                                self.send_response(404)
                                return
                        self.send_response(200)
                        self.send_header('Content-type', mimetype);
                        self.end_headers()
                        self.wfile.write(f.read())
                        f.close()
        def do_POST(self):
                url = urlparse.urlparse(self.path)
                print self.headers.getheader('content-type')
                ctype, pdict = cgi.parse_header(self.headers.getheader('content-type'))
                if ctype == 'multipart/form-data':
                        postvars = cgi.parse_multipart(self.rfile, pdict)
                elif ctype == 'application/x-www-form-urlencoded':
                        length = int(self.headers.getheader('content-length'))
                        postvars = urlparse.parse_qs(self.rfile.read(length), keep_blank_values=1)
                else:
                        postvars = {}
                print 'POST Path: ' + url.path
                print postvars
                packet = Packet()
                try:
                        packet.id = int(postvars['id'][0])
                        if 'data[]' in postvars:
                                packet.data = map(lambda x: int(x),postvars['data[]'])
                        else:
                                packet.data = []
                except ValueError:
                        print "Error: Bad post packet"
                interface.send(packet)

if __name__ == "__main__":
        #First parse the command line args
        argparser = argparse.ArgumentParser(description='''
                pTelem is a telemetry server that takes data from a serial
                port or log file, and presents it va a HTTP and JSON API.
                It also can log packets to disk.
                ''')
        argparser.add_argument('-f', '--file', help='input log or serial port name')
        argparser.add_argument('-i', '--interface', help='''CAN interface type,
                use `-i list` to get supported types''')
        argparser.add_argument('-b', '--browser', help='''Open web browser
                with URL of this server''', action='store_true')
        argparser.add_argument('-l', '--log', help='Write to specified log file')
                
        args = argparser.parse_args()
        if args.interface == 'list':
                print '''Supported interface types:
                c2log\tCentaurus 2 log replay
                c2telem\tCentaurus 2 live telemetry
                c3telem\tCentaurus 3 live telemetry'''
                sys.exit()
                
        if args.log != None:
                logger = Logger(args.log)

        print 'Type `pTelem.py --help` for usage information.'

        httpd = ThreadingHTTPServer(('',8000), TelemetryHTTPHandler)
        httpd.daemon_threads = True
        print 'Web server started. Connect at http://localhost:8000/'

        if args.browser == True:
                webbrowser.open('http://localhost:8000/')
		
		
        if '-f' in sys.argv:
				#input_file is actually the comPort number
                input_file = sys.argv[sys.argv.index('-f') + 1]
                if args.interface == 'c2log':
                        print 'Replaying C2 format log file',input_file
                        interface = InterfaceC2Log(input_file)
                        interface.start()
                elif args.interface == 'c2telem':
                        print 'Opening C2-style serial telemetry from serial port',input_file
                        interface = InterfaceC2Telemetry(input_file)
                        interface.start()
                elif args.interface == 'c3telem':
                        print 'Opening C3-style serial telemetry from serial port',input_file
                        interface = InterfaceC3Telemetry(input_file)
                        interface.start()
                elif args.interface == 'etelem':
                        print 'Opening E-style serial telemetry from serial port',input_file
                        interface = InterfaceETelemetry(input_file)
                        interface.start()
                else:
                        print 'No interface type specified. Use `-i list` to list available types.'
                        interface = InterfaceNull()
                        
        if args.interface == None:
                print 'Not connected to any CAN interface. Use -f and -i to select one.'
                interface = InterfaceNull()

        try:
                httpd.serve_forever()
        except KeyboardInterrupt:
                if interface != None:
                        interface.stop()
                        sys.exit()
