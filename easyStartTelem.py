from subprocess import Popen, PIPE, STDOUT
from os import path, makedirs
import sys
import glob
import serial
import re
from time import gmtime, strftime
import socket

# This function taken from this stackoverflow thread:
# http://stackoverflow.com/questions/12090503/listing-available-com-ports-with-python
def serial_ports():
    """ Lists serial port names

        :raises EnvironmentError:
            On unsupported or unknown platforms
        :returns:
            A list of the serial ports available on the system
    """
    if sys.platform.startswith('win'):
        ports = ['COM%s' % (i + 1) for i in range(256)]
    elif sys.platform.startswith('linux') or sys.platform.startswith('cygwin'):
        # this excludes your current terminal "/dev/tty"
        ports = glob.glob('/dev/tty[A-Za-z]*')
    elif sys.platform.startswith('darwin'):
        ports = glob.glob('/dev/tty.*')
    else:
        raise EnvironmentError('Unsupported platform')

    result = []
    for port in ports:
        try:
            s = serial.Serial(port)
            s.close()
            result.append(port)
        except (OSError, serial.SerialException):
            pass
    return result

def execute(*args):
	print(' + '+' '.join(args))
	p = Popen(args, stdout=PIPE, stderr=STDOUT, stdin=PIPE, shell=True)
	for line in p.stdout:
		sys.stdout.write(line)

def check_python_path():
	try:
		py_path_ver = Popen(['python', '-c', 'import platform;print(platform.python_version())'], stdout=PIPE, stderr=STDOUT, shell=True).communicate()[0].strip()
		print(" - The python version on your path is " + py_path_ver)
	except:
		print(" - Looks like python is not in your path...")
		return
	if py_path_ver.startswith('3'):
		print(" - You need to have python 2.7.X on your path to run the telemetry server using this script (python 3 won't work)")
	elif not py_path_ver.startswith('2'):
		print(" - The python executable on your path is messed up...")

def check_ip():
	try:
		my_ip = socket.gethostbyname(socket.getfqdn())
		print(" - Your local IP address is " + my_ip)
	except:
		return

check_ip()
check_python_path()

com_port = None
while True:
	com_ports = serial_ports();
	com_port = str(raw_input("COM Port ({}): ".format(", ".join(com_ports)))).strip().upper()
	com_port = (com_port if com_port.startswith('COM') else 'COM' + com_port) if com_port else com_ports[-1]
	if com_port not in com_ports:
		print(" - Invalid Selection!")
	else:
		break
print(" - Will use " + com_port)

log_folder = path.join('..','logs',re.sub('[^\w\-_\. ]', '_', raw_input("Log Description: ").strip().replace(' ','-')))
if not path.isdir(log_folder):
	if path.exists(log_folder):
		#Very unlikely to happen (I think)
		raise Exception(' - A file with the name "' + log_folder + '" exists! Help!')
	else:
		makedirs(log_folder)
		print(' - Creating Directory "' + log_folder + '"')
		

log_file = path.join(log_folder, strftime("%Y-%m-%d-%H%M%S.txt", gmtime()))
print(" - Will log to " + log_file)

execute('pTelem.py', '-f', com_port, '-l', log_file, '-i', 'etelem', '-b')