var trackerPower = [0,0,0,0,0,0,0,0];
var trackerPowerHWM = 0;

var batteryVoltage = 0;
var batteryCurrent = 0;
var batteryPower = 0;
var batteryPowerAverage = 0;
var batteryAh = 0;

var motorBusVoltage = [0,0];
var motorBusCurrent = [0,0];
var motorBusPower = [0,0];
var motorBusPowerAverage = [0,0];

var lapArrayAccumulator = 0;
var lapSpeedAccumulator = 0;
var lapSpeedCounts = 0;
var lapmAhStart = 0;
var lapTimeStart = new Date();
var speed = 0;
var arrayAmps = 0;

function updateBatteryPower(){
	batteryPower = (batteryVoltage * batteryCurrent).toFixed(1);
	
	var e = 0.05;
	batteryPowerAverage = batteryPowerAverage * (1-e) + (e * batteryPower);
	
	setContent('data-batt-power', batteryPower);
	setContent('data-ave-batt-power', batteryPowerAverage.toFixed(1));
}

function setSw(cls, state){
	if(state){
		$('.'+cls).addClass('sw-enable');
		$('.'+cls).removeClass('sw-disable');
	}else{
		$('.'+cls).addClass('sw-disable');
		$('.'+cls).removeClass('sw-enable');
	}
}

var options = {
		series: { 
		shadowSize: 0, 
		color: "#00aa00",
		threshold: { below: 0, color: "#aa0000" },
		},
	yaxis: { min: -103, 
		max: 33, 
		ticks: 8,
		position: "right", 
		autoscaleMargin: 0.10,
		tickFormatter: function(v, axis){
                return v.toFixed(0) + "A";
            }
	},
	xaxis: { show: false }
};
var batteryCurrentPlot = new livePlot($("#graph-current"), options, 200);

var options = {
	series: { 
		shadowSize: 0, 
		color: "#800080",
		threshold: { below: 0, color: "#aa0000" },
		},
	yaxis: { min: -15,
		max: 105, 
		ticks: 12,
		position: "right", 
		autoscaleMargin: 0.1,
		tickFormatter: function (v, axis){
                return v.toFixed(0) + "kph";
            }
	},
	xaxis: { show: false }
};
var speedPlot = new livePlot($("#graph-speed"), options, 200);	

var options = {
	series: { 
		shadowSize: 0, 
		color: "#0000aa",
		threshold: { below: 0, color: "#00aa00" },
		},
	yaxis: { min: -100, 
		max: 100, 
		ticks: 12,
		position: "right",
		autoscaleMargin: 0.1,
		tickFormatter: function (v, axis){
                return v.toFixed(0) + "%";
            }
	},
	xaxis: { show: false }
};
var drivePlot = new livePlot($("#graph-drive"), options, 200);

var x;
registerPacketsReadyCallback(function(){

    regPacketId(packetFormatByName.car_speed.id, function(packet){
        decodePacket(packet);
        speed = (packet.i.speed.cvalue);
        setContent("data-speed", (speed).toFixed(1));
        speedPlot.addPoint(speed);
    });
	
	regPacketId(packetFormatByName.tritium_motor_drive.id, function(packet){
		decodePacket(packet);
		
		var drive = (packet.f.motor_current*(packet.f.motor_velocity ? 100 : -100));
		
		drivePlot.addPoint(drive);
		setContent("data-drive", drive.toFixed(1));
	});

    // new current packet
    regPacketId(packetFormatByName.bp_current.id, function(packet){
        decodePacket(packet)
        setContent("data-batt-current", (packet.i.main.cvalue).toFixed(3));
        setContent("data-tracker-current", (packet.i.tracker.cvalue).toFixed(3));
        batteryCurrent = packet.i.main.cvalue;
        batteryCurrentPlot.addPoint(batteryCurrent);
		
		updateBatteryPower();
    });

    // new state of charge packet
    regPacketId(packetFormatByName.bp_soc.id, function(packet){
        decodePacket(packet);
        batteryAh = packet.i.Ah.cvalue
        setContent("data-batt-soc", packet.i.Ah.cvalue.toFixed(3));
        setContent("data-batt-soc-pcnt", packet.i.soc.cvalue.toFixed(3));
    });

    regPacketId(packetFormatByName.bp_minmax.id, function(packet){
        decodePacket(packet);
        setContent("data-batt-mincell", packet.i.min_cell.cvalue.toFixed(3));
        setContent("data-batt-maxcell", packet.i.max_cell.cvalue.toFixed(3));
        setContent("data-batt-maxtemp", packet.i.max_temp.cvalue.toFixed(3));
		setContent("data-batt-mintemp", packet.i.min_temp.cvalue.toFixed(3));
    });

    /*
    regPacketId(packetFormatByName.tritium_velocity.id, function(packet){
        decodePacket(packet);
        speed = (packet.i.vehicle_velocity.cvalue * 1);
        setContent("data-speed", speed.toFixed(1));
        speedPlot.addPoint(speed);

    });
    */
    
    regPacketId(packetFormatByName.kill.id, function(packet){
        alert('Kill Packet Sent');
        console.log(packet);
    });
	
	regPacketId(packetFormatByName.bp_startup_error.id, function(packet){
		alert('Car Killed by BP');
		console.log(packet);
	});
    
    // BP Modules
    regPacketRange(packetFormatByName.bp_module__0.id, packetFormatByName.bp_module__0.id + CELLS, function(packet) {
        decodePacket(packet);
        
        updateErrors(packet.id - packetFormatByName.bp_module__0.id, packet.i.discharge.cvalue);
        updateVoltage(packet.id - packetFormatByName.bp_module__0.id, packet.i.voltage.cvalue);
        updateTemp(packet.id - packetFormatByName.bp_module__0.id, packet.i.temperature.cvalue);
    });

    //BP Limits
    regPacketId(packetFormatByName.bp_temp.id, function(packet){
        decodePacket(packet)
        setContent('data-limit-temp-charge', packet.i.charge_temp.cvalue)
        setContent('data-limit-temp-discharge', packet.i.discharge_temp.cvalue)
    });
    
    regPacketId(packetFormatByName.bp_volt.id, function(packet){
        decodePacket(packet)
        setContent('data-limit-volt-max', packet.i.voltage_max.cvalue)
        setContent('data-limit-volt-min', packet.i.voltage_min.cvalue)
    });
    
    regPacketId(packetFormatByName.bp_currentlimit.id, function(packet){
        decodePacket(packet)
        setContent('data-limit-current-charge', packet.i.current_max.cvalue)
        setContent('data-limit-current-discharge', packet.i.current_min.cvalue)
    });
    
    //Power Trackers
    regPacketRange(0x600, 0x60f, function(packet){
        var trackerNum = packet.id-0x600;
		
        setContent('data-trackers-voltage-'+trackerNum, (uint16p_le(packet, 0)/100).toFixed(2));
        setContent('data-trackers-current-'+trackerNum, (uint16p_le(packet, 2)/1000).toFixed(3));
        setContent('data-trackers-bvoltage-'+trackerNum, (uint16p_le(packet, 4)/100).toFixed(2));
        setContent('data-trackers-temp-'+trackerNum, (uint16p_le(packet, 6)/100).toFixed(2));
		
        trackerPower[trackerNum] = (uint16p_le(packet, 0)/100) * (uint16p_le(packet, 2)/1000);
		
        sumPower = 0;
        for(var i in trackerPower){
            sumPower = sumPower + trackerPower[i];
        }
		trackerPowerHWM = Math.max(trackerPowerHWM, sumPower);
		
        arrayAmps = (sumPower / batteryVoltage);
        setContent('data-tracker-current-calc', arrayAmps.toFixed(2));
        setContent('data-tracker-power', sumPower.toFixed(2));
		
		setContent('data-tracker-power', sumPower.toFixed(2));
		setContent('data-tracker-power-hwm', trackerPowerHWM.toFixed(2));
    });

    regPacketId(packetFormatByName.cruise_info.id, function(packet){
        decodePacket(packet);
        setContent('data-targetspeed', (packet.i.speed_target.cvalue * 2.23694).toFixed(2));
    });
    
    //Drive
    regPacketId(packetFormatByName.switch_states.id, function(packet){
        decodePacket(packet);
        
        if (packet.f.direction_fwd) {
            setContent('data-direction', "Forward");
        } else if(packet.f.direction_rev) {
            setContent('data-direction', "Reverse");
        } else {
            setContent("data-direction", "Disabled");
        }

        setSw('data-di-hazards', packet.f.hazards);
        setSw('data-di-boosh', packet.f.boosh);
        setSw('data-di-cruise', packet.f.cruise);
        setSw('data-di-console', packet.f.console);
        setSw('data-di-magic1', packet.f.magic1);
        setSw('data-di-magic2', packet.f.magic2);
        
        setSw('data-anybrakes', packet.f.any_brakes);
    });

    //regPacketId(packetFormatByName.driver_display.id, function(packet){
    //    decodePacket(packet);
    //    setSw('data-mechbrakes', packet.f.brakes_on);
    //});
	
	regPacketId(packetFormatByName.lights_control.id, function(packet){
        decodePacket(packet);
		//if(!packet.f.brake_left) {
			setSw('data-mechbrakes', packet.f.brake);
		//}
    });
    
    //Wheel
    regPacketId(packetFormatByName.steering.id, function(packet){
        decodePacket(packet);
        if (packet.f.turn_left && packet.f.turn_right) {
			setContent("data-blinkers", '<span class="blinkers-haz"></span>');
		} else if (packet.f.turn_left) {
            setContent("data-blinkers", '<span class="blinkers-left"></span>');
        } else if (packet.f.turn_right) {
            setContent("data-blinkers", '<span class="blinkers-right"></span>');
        } else {
            setContent("data-blinkers", "Off");
        }
    });
	
	regPacketId(packetFormatByName.dashboard_pedal_percentages.id, function(packet){
        decodePacket(packet);
		
		setContent('data-accelerator', packet.f.accel_pedal_value);
        setContent('data-regen', packet.f.brake_pedal_value);
    });
    
    regPacketId(packetFormatByName.bp_state.id, function(packet){
        decodePacket(packet);
        
        setSw('data-contactor-trackerpre', packet.f.contactor_tracker_pre)
        setSw('data-contactor-bus', packet.f.contactor_bus)
        setSw('data-contactor-buspre', packet.f.contactor_bus_pre)
        setSw('data-contactor-tracker', packet.f.contactor_tracker)
        
        setContent('data-batt-voltage', packet.i.battery_voltage.cvalue.toFixed(1))
        batteryVoltage = packet.i.battery_voltage.cvalue
        
        setContent('data-batt-primarypower', packet.i.primary_voltage.cvalue.toFixed(2));
        setContent('data-batt-auxpower', packet.i.aux_voltage.cvalue.toFixed(2));

		updateBatteryPower();
    });

	//Wavesculptors
	var wsPrefixes = ['wsl', 'wsr'];
	var wsPackets = {
		'status_information':{
			func: function(packet, i){
				setContent('data-'+wsPrefixes[i]+'-error-flags', packet.i.error_flags.cvalue);
			},
			params:{
				'limit_flags':'limit-flags'
			}
		},
		'motor_current_vector':{
			params:{
				'iq':'iq',
				'id':'id'
			}
		},
		'motor_voltage_vector':{
			params:{
				'vq':'vq',
				'vd':'vd',
			}
		},
		'motor_backemf':{
			params:{
				'bemfq':'bemfq',
				'bemfd':'bemfd',
			}
		},
		'heatsink_motor_temp':{
			params:{
				'motor_temp':'motor-temp',
				'heatsink_temp':'heatsink-temp'
			}
		},
		'bus_measurement':{
			func: function(packet, i){
				motorBusVoltage[i] = packet.i.bus_voltage.cvalue;
				motorBusCurrent[i] = packet.i.bus_current.cvalue;
				motorBusPower[i] = motorBusVoltage[i] * motorBusCurrent[i];
				
				var e = 0.05;
				motorBusPowerAverage[i] = motorBusPowerAverage[i] * (1 - e) + (motorBusPower[i] * e);
				
				setContent('data-'+wsPrefixes[i] +'-bus-power', motorBusPower[i].toFixed(1));
				setContent('data-'+wsPrefixes[i] +'-ave-bus-power', motorBusPowerAverage[i].toFixed(1));
				
				var totalMotorBusPowerAverage = motorBusPowerAverage.reduce(function(s,c){return s+c;},0);
				
				
				setContent('data-ws-ave-bus-power', totalMotorBusPowerAverage.toFixed(1));
			},
			params:{
				'bus_voltage':'bus-voltage',
				'bus_current':'bus-current'
			}
		}
	};
	
	wsPrefixes.forEach(function(wsPrefix, i){
		for(var wsPacket in wsPackets){
			if(!wsPackets.hasOwnProperty(wsPacket)) { continue; }
			
			var wsPacketData = wsPackets[wsPacket];
			
			(function(wsPrefix, wsPacketData, i){
				regPacketId(packetFormatByName[wsPrefix + '_' + wsPacket].id, function(packet){
					decodePacket(packet);
					
					if(wsPacketData.params){
						for(var wsParam in wsPacketData.params){
							if(!wsPacketData.params.hasOwnProperty(wsParam)) { continue; }
						
							var wsSubClass = wsPacketData.params[wsParam];
							setContent('data-' + wsPrefix + '-' + wsSubClass, packet.i[wsParam].cvalue.toFixed(2));
						}
					}
					
					if(wsPacketData.func) wsPacketData.func(packet, i);
				});
			})(wsPrefix, wsPacketData, i);
		}
	});

});

