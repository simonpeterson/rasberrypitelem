function bit(byte, pos) {
    return byte & (1<<pos);
}
function uint8(byte) {
    return byte;
}
function int8(byte) {
    if (byte > 127) {
	return byte - 256;
    } else {
	return byte;
    }
}
function uint16(msb, lsb) {
    return msb * 256 + lsb;
}
function int16(msb, lsb) {
    var out = msb * 256 + lsb;
    if (out > 32767) {
	out = out - 65536;
    }
    return out;
}
function uint32(b3,b2,b1,b0) {
    return b3*16777216+b2*65536+b1*256+b0;
}
function int32(b3,b2,b1,b0) {
    var out = uint32(b3,b2,b1,b0);
	if (out > 2147483648){
		out = out-4294967296;
	}
	return out;
}
function uint8p(packet, index) {
    return uint8(packet.data[index]);
}
function uint16p(packet, index) {
    return uint16(packet.data[index],packet.data[index+1]);
}
function uint16p_le(packet, index) {
    return uint16(packet.data[index+1],packet.data[index]);
}
function int16p(packet, index) {
    return int16(packet.data[index],packet.data[index+1]);
}
function int16p_le(packet, index) {
    return int16(packet.data[index+1],packet.data[index]);
}
function uint32p(packet, index){
    return uint32(packet.data[index],packet.data[index+1],packet.data[index+2],packet.data[index+3]);
}
function uint32p_le(packet, index){
    return uint32(packet.data[index+3],packet.data[index+2],packet.data[index+1],packet.data[index]);
}
function int32p(packet, index){
    return int32(packet.data[index],packet.data[index+1],packet.data[index+2],packet.data[index+3]);
}
function int32p_le(packet, index){
    return int32(packet.data[index+3],packet.data[index+2],packet.data[index+1],packet.data[index]);
}
function pollPackets(packetList, callback) {
    if (!!window.EventSource) {
	var packets = [];
	streamPackets(function(packet) {
	    packets[packet.id] = packet;
	    callback(packets);
	});
    } else {
	$.getJSON("/magic/latest_packets",{id: packetList }, callback);
	setTimeout(function () {
	    pollPackets(packetList, callback);
	}, 100);
    }
}
// the following function is mostly only used as a fallback for streamPackets
function pollAllPackets(callback) {
    $.getJSON("/magic/latest_packets",{id: [1], all: true }, callback);
    setTimeout(function () {
	pollAllPackets(callback);
    }, 100);
}
function streamPackets(callback) {
    if (!!window.EventSource) {
	var source = new EventSource('/magic/json_source')
	source.addEventListener('message', function(e) {
	    callback($.parseJSON(e.data));
	});
    } else {
	
	var last_packets = [];
	pollAllPackets(function (packets) {
	    for (packetnum in packets) {
		    packet = packets[packetnum];
		    if ((packet.id in last_packets)) {
			    if (packet.time == last_packets[packet.id].time) { 
				    continue;
			    }
		    }
		    last_packets[packet.id] = packet;
		    callback(packet);
	    }
	} );
    }
}
function sendPacket(packet) {
    $.ajax("/magic/send_packet", {type: "POST", data: packet});
}

var packetFormatByID = [];
var packetFormatByName = {};
var packetFormats;

var packetFormatsReadyCB = []
var packetFormatsReady = false

$(function() {
    $.getJSON("packets.json",function (data) {
        packetFormats = data.packets;
        for (typenum in data.packets) {
            packetFormatByID[data.packets[typenum].id] = data.packets[typenum];
            packetFormatByName[data.packets[typenum].name] = data.packets[typenum];
        }
        
        packetFormatsReady = true;
        for (i in packetFormatsReadyCB){
            packetFormatsReadyCB[i](packetFormats);
        }
    });
});

function registerPacketsReadyCallback(fxn){
    if(packetFormatsReady){
        fxn(packetFormats);
    }else{
        packetFormatsReadyCB.push(fxn);
    }
}

function decodePacket(packet) {
    if (!(packet.id in packetFormatByID)) return;
    var byte = 0;
    var format = packetFormatByID[packet.id];
    var endian = 'little';
    var littleEndian = (format.endian == 'little')
    packet.name = format.name;
    packet.f = {};
	packet.i = {};
    var field_data;
    var buffer = new ArrayBuffer(8);
	var asBytes = new Uint8Array(buffer);
    for (var i in packet.data) {
        asBytes[i] = packet.data[i];
    }
	dv = new DataView(buffer);
    for (field_num in format.data) {
        switch (format.data[field_num].type) {
        case "uint8_t":
            field_data = dv.getUint8(byte);
            byte += 1;
            break;
        case "int8_t":
            field_data = dv.getInt8(byte);
            byte += 1;
            break;
        case "uint16_t":
			field_data = dv.getUint16(byte, littleEndian);
            byte += 2;
            break;
        case "int16_t":
            field_data = dv.getInt16(byte, littleEndian);
            byte += 2;
            break;
        case "uint32_t":
            field_data = dv.getUint32(byte, littleEndian);
            byte += 4;
            break;
        case "int32_t":
            field_data = dv.getInt32(byte, littleEndian);
            byte += 4;
            break;
	    case "float":
			field_data = dv.getFloat32(byte, littleEndian);
			byte += 4;
			break;
        case "uint64_t":
            field_data = littleEndian ? (dv.getUint32(byte, littleEndian) * 0x100000000 + dv.getUint32(byte + 4, littleEndian)) : (dv.getUint32(byte, littleEndian) + dv.getUint32(byte + 4, littleEndian) * 0x100000000);
            byte += 8;
            break;
       case "double":
            field_data = dv.getFloat64(byte, littleEndian);
            byte += 8;
            break;
        case "bitfield":
            field_data = uint8p(packet, byte);
            for (bit_num in format.data[field_num].bits) {
				var bitval = (field_data & (1 << bit_num)) ? 1 : 0;
                packet.f[format.data[field_num].bits[bit_num].name] = bitval;
				packet.i[format.data[field_num].bits[bit_num].name] = {
					'value':(bitval),
					'cvalue':(bitval),
					'unit':'bool'
				}
            }
            byte += 1;
            break;
        }
		var fmtdata = format.data[field_num]
        packet.f[fmtdata.name] = field_data;
		packet.i[fmtdata.name] = {}
		packet.i[fmtdata.name]['value'] = field_data
		if("conversion" in fmtdata){
			//conversion data is available,  we should convert to std units
			packet.i[fmtdata.name]['cvalue'] = (field_data*fmtdata['conversion'])
		}else{
			//otherwise don't convert
			packet.i[fmtdata.name]['cvalue'] = field_data
		}
		if("unit" in fmtdata){
			packet.i[fmtdata.name]['unit'] = fmtdata['unit']
		}else{
			packet.i[fmtdata.name]['unit'] = "" //no units
		}
    }
}
function encodePacket(packet) {
    if (!(packet.id in packetFormatByID)) return;
    var byte = 0;
    var format = packetFormatByID[packet.id];
	
	var buffer = new ArrayBuffer(8);
	var asBytes = new Uint8Array(buffer);
	var dv = new DataView(buffer, 0);
	var littleEndian = (format.endian == 'little')
	
    packet.data = [];
	
    for (field_num in format.data) {
	switch (format.data[field_num].type) {
	    case "uint8_t":
			dv.setUint8(byte, packet.f[format.data[field_num].name]);
			byte += 1;
		break;
	    case "int8_t":
			dv.setInt8(byte, packet.f[format.data[field_num].name]);
		byte += 1;
		break;
	    case "uint16_t":
			dv.setUint16(byte, packet.f[format.data[field_num].name], littleEndian);
			byte += 2;
		break;
	    case "int16_t":
			dv.setInt16(byte, packet.f[format.data[field_num].name], littleEndian);
			byte += 2;
		break;
	    case "uint32_t":
			dv.setUint32(byte, packet.f[format.data[field_num].name], littleEndian);
			byte += 4;
		break;
	    case "int32_t":
			dv.setInt32(byte, packet.f[format.data[field_num].name], littleEndian);
			byte += 4;
		break;
	    case "float":
			dv.setFloat32(byte, packet.f[format.data[field_num].name], littleEndian);
			byte += 4;
		break;
        case "uint64_t":
            dv.setUint64(byte, packet.f[format.data[field_num].name], littleEndian);
            byte += 8;
            break;
       case "double":
            dv.setFloat64(byte, packet.f[format.data[field_num].name], littleEndian);
            byte += 8;
            break;
	    case "bitfield":
			output = 0;
			for(bit in format.data[field_num].bits){
				if(packet.f[format.data[field_num].bits[bit].name]){
					output |= 1<<bit;
				}
			}
			dv.setUint8(byte, output);
			byte += 1;
		break;
	}
    }
	for (i=0; i<byte; i++) {
        packet.data[i] = asBytes[i];
    }
}
