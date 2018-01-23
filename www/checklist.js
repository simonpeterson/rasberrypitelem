var checklist_packets = {}

function checklist_add(id){
    checklist_packets[id] = 0
}

function checklist_kick(id){
    checklist_packets[id] = Date.now()
}

function checklist_addDefault(name){
    if(!(name in packetFormatByName)) return;
    var id = packetFormatByName[name].id
    checklist_add(id)
    regPacketId(id, function(packet){
        checklist_kick(packet.id)
    })
}

function checklist_getElem(id){
    return $(".ck-" + packetFormatByID[id].name)
}

function checklist_setclass(id, cls){
    var elem = checklist_getElem(id)
    if(elem.length == 0) return
    elem.removeClass("plugged")
    elem.removeClass("unplug")
    elem.addClass(cls)
}

function checklist_update(){
    for(id in checklist_packets){
        if(Date.now() - checklist_packets[id] < 20000){
            //GREEN
            checklist_setclass(id, 'plugged')
        }else{
            //RED
            checklist_setclass(id, 'unplug')
        }
    }
}

function checklist_set_error(id, is_error){
    if(is_error){
        checklist_getElem(id).removeClass("error")
    }else{
        checklist_getElem(id).addClass("error")
    }
}

var x;
registerPacketsReadyCallback(function(){
    setInterval(checklist_update, 400);

    checklist_addDefault('lights_id')
    checklist_addDefault('ngm_motor_state')
    checklist_addDefault('bp_state')
    checklist_addDefault('telemetry_latlon')
    checklist_addDefault('driver_display')
    checklist_addDefault('switch_states')
    checklist_addDefault('lights_id')
    
    checklist_add(packetFormatByName.tritium_status.id)
    regPacketRange(packetFormatByName.tritium_status.id, function(p){
        decodePacket(p)
        checklist_kick(p.id)
        checklist_set_error(p.id, p.error_flags == 0)
    });
    
    regPacketId(packetFormatByName.bp_state.id, function(p){
        decodePacket(p)
        if(p.i.aux_voltage.cvalue > 17.5){
            $('.ck-secondary_pack').removeClass("error")
        }else{
            $('.ck-secondary_pack').addClass("error")
            $('.ck-secondary_pack').addClass("plugged")
        }
    })
    
    checklist_add(0x601)
    checklist_add(0x602)
    checklist_add(0x603)
    checklist_add(0x604)
    regPacketRange(0x600, 0x60f, function(p){
        decodePacket(p);
        checklist_kick(p.id)
        checklist_set_error(p.id, (p.i.array_voltage.cvalue > 10) && (p.i.battery_voltage.cvalue > 80))
    })
})