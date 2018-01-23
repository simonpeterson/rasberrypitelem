
var packetMonTable = {}; //dictionary for packets
var packetMonUseHex = false;

$('#control-packetmon-reset').click(function(e){
	e.preventDefault();
	packetMonTable = {};
	$("#packets_monitor tbody").html('');
});

$('#control-packetmon-hex').change(function(){
	packetMonUseHex = this.checked;
});

function updatePacketMonitor(){
	for(var id in packetMonTable){
		var packet = packetMonTable[id][0];
		var id_display = (packetMonUseHex)?decimalToHex(packet.id):packet.id;
		table_entry = '<td>'+id_display+'</td>';
		table_entry += '<td>'+packetMonTable[id][2]+'</td>';

		for (data in packet.data) {
			if(packetMonUseHex){
				var value = decimalToHex(packet.data[data]);
				if(value.len == 1) value = '0' + value;
			}else{
				var value = packet.data[data];
			}
			table_entry += '<td>'+value+'</td>';
		}

		if ($('#pacmon'+packet.id).length) {
			$('#pacmon'+packet.id).html(table_entry);
		} else {
			$("#packets_monitor tbody").append('<tr id="pacmon'+packet.id+'">'+table_entry+'</tr>');
		}		
		if(!packetMonTable[id][1]){
			$('#pacmon'+id).css('background-color', "yellow");
		}else{
			$('#pacmon'+id).css('background-color', "white");
		}
		packetMonTable[id][1] = true; //mark as displayed
	}
}
//This controls the update rate of the packet monitor
setInterval(updatePacketMonitor, 200);



regPacketRange(0, 2048, function(packet) {
	count = (packet.id in packetMonTable)? packetMonTable[packet.id][2]+1 : 1;
	packetMonTable[packet.id] = [packet, false, count];
});

registerPacketsReadyCallback(function (packets) {
	for (typenum in packets) {
		$('#cande-yaml-id').append("<option value='"+packets[typenum].id+"'>"+packets[typenum].name+" ["+packets[typenum].id+"]</option>");
	}
	$("#cande-yaml-id").css("height", 500);
});

cande_allowed_ids = []
$("#cande-yaml-id").change(function(e){
	cande_allowed_ids = $("#cande-yaml-id").val();
});


function updatePacketDecoder(){
	var template = $('#cande-packet-template')

	$('#cande-packets').html('')
	
	for(var idx in cande_allowed_ids){
		var id = cande_allowed_ids[idx]
		var txtid = 'cande' + id;
		
		if(id in packetMonTable){
			var packet = packetMonTable[id][0];
			decodePacket(packet)
			
			var newTemplate = template.clone()
			
			newTemplate.find('.cande-name').each(function(k,v){v.innerHTML = packet.name});
			newTemplate.find('.cande-id').each(function(k,v){v.innerHTML = packet.id;});
			newTemplate.find('.cande-id-hex').each(function(k,v){v.innerHTML = '0x'+decimalToHex(packet.id,3);});
			newTemplate.find('.cande-count').each(function(k,v){v.innerHTML = packetMonTable[id][2];});
			newTemplate.find('.cande-rtr').each(function(k,v){v.innerHTML = packet.rtr;});
			newTemplate.find('.cande-description').each(function(k,v){v.innerHTML = packetFormatByID[id].description;});
			
			for(i in packet.data){
				tablerow = "<tr><td>"+i+"</td><td>"+packet.data[i]+" ("+decimalToHex(packet.data[i],2)+")</td></tr>"
				newTemplate.find('.cande-table-raw').append(tablerow)
			}
			
			for(name in packet.i){
				tablerow = "<tr><td>"+name+"</td><td>"+packet.i[name]['cvalue']+"</td><td>"+packet.i[name]['unit']+"</td></tr>"
				newTemplate.find('.cande-table-decoded').append(tablerow)
			}
			
			newTemplate.attr('id', txtid)
			
			$('#cande-packets').append(newTemplate)
			
		}
	}
}
setInterval(updatePacketDecoder, 200);




registerPacketsReadyCallback(function (packets) {
    for (typenum in packets) {
        $('#packmon-yaml-id').append("<option value='"+packets[typenum].id+"'>"+packets[typenum].name+" ["+packets[typenum].id+"]</option>");
    }
});

function packetmonUpdatePacketPreview(packet){
    encodePacket(packet);
    for(var field in packet.data){
        $("#packmon-yaml-"+field).html(packet.data[field]);
    }
}

$('#packmon-yaml-id').change(function(){
    var pkt = packetFormatByID[this.value];
    $('#packmon-yaml-desc').html(pkt.description);
    $('#packmon-yaml-data').html("");
    var packet = new Object();
    packet.data = []
    packet.id = this.value;
    packet.f = {};
    for (elemnum in pkt.data){
        if(pkt.data[elemnum].type != 'bitfield'){
            input = $("<input data-num='"+elemnum+"' type='text' />");
            packet.f[pkt.data[elemnum].name] = 0;
            $(input).keyup(function(){
                var num = $(this).data('num');
                var conversion
                if(typeof pkt.data[num].conversion != 'undefined'){
                    conversion = pkt.data[num].conversion
                }else{
                    conversion = 1
                }
                packet.f[pkt.data[num].name] = Math.round(this.value / conversion);
                packetmonUpdatePacketPreview(packet);
            });
            $('#packmon-yaml-data').append("<label>"+pkt.data[elemnum].name+" ("+pkt.data[elemnum].units+")</label>");
            $('#packmon-yaml-data').append(input);
        }else{
            $('#packmon-yaml-data').append("<fieldset>");
            for(bitnum in pkt.data[elemnum].bits){
                input = $("<input data-num='"+elemnum+"' data-bit='"+bitnum+"' type='checkbox' />");
                packet.f[pkt.data[elemnum].bits[bitnum].name] = 0;
                input.change(function(){
                    var num = $(this).data('num');
                    var bit = $(this).data('bit');
                    packet.f[pkt.data[num].bits[bit].name] = (this.checked) ? 1 : 0;
                    packetmonUpdatePacketPreview(packet);
                });
                $('#packmon-yaml-data').append("<label>")
                $('#packmon-yaml-data').append(input);
                $('#packmon-yaml-data').append(" "+pkt.data[elemnum].bits[bitnum].name+"</label>");
            }
            $('#packmon-yaml-data').append("</fieldset>");
        }
        $('#packmon-yaml-send').unbind();
        $('#packmon-yaml-send').click(function(e){
            e.preventDefault();
            sendPacket(packet);
        });
    }
});
$('#packmon-yaml-send').click(function(e){
    e.preventDefault();
});

$('#packmon-yaml-send-raw').click(function(e){
    e.preventDefault();
    
    var packet = new Object();
    packet.data = []
    for(var i = 0; i<8; i++){
        var val = parseInt($("#packmon-send-" + i).val())
        if(!isNaN(val)){
            packet.data.push(val)
            console.log(val);
        }
    }
    packet.id = $("#packmon-send-id").val();
    
    sendPacket(packet);
});