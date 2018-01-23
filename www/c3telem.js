var lagCutoffMs = 1500;
var connectionInitTime;
var lastPacketTime;
var serverTime;
var connected = false;

function setContent(cls, value){
	var items = document.getElementsByClassName(cls)
	if (items.length == 1){
		document.getElementsByClassName(cls)[0].innerHTML = value;
	}else{
		for(var i = 0; i<items.length; i++){
			document.getElementsByClassName(cls)[i].innerHTML = value;
		}
	}
}

function gotPacket(packet){
	lastPacketTime = new Date();
	serverTime = new Date(packet.time*1000);
}

function initializeConnection(){
	connectionInitTime = new Date();
	$('#statusbar-right .connected').hide();
}

function updateConnectionStatus(){
	lag = new Date() - lastPacketTime;
	if(!isNaN(lag)){
		if(lag < lagCutoffMs){
			$('#statusbar-right .connected').show();
			$('#statusbar-right .disconnected').hide();
			connected = true;
		}else{
			$('#statusbar-right .connected').hide();
			$('#statusbar-right .disconnected').show();
			$('#lag').html(((lag)/1000).toFixed(1));
			connected = false;
		}
	}
	if('undefined' != typeof(serverTime)){
		$('#server-time').html(serverTime.toLocaleString());
	}
}

/* LIVE PLOT */

function livePlot(node, options, points){
	this._data = [];
	this._datasets = [this._data];
	this._plot = $.plot(node, this._datasets, options);
	this._points = points;
	for (var i = 0; i < points; i++)
		this._data.push(null);
	this.refreshDraw();
	this._plot.draw();
	this._plot.setupGrid();
}

livePlot.prototype.refreshDraw = function(){
	var pairs = [];
	var missingPoints = this._points - this._data.length;
	for (var i = 0; i < missingPoints; ++i)
		pairs.push([i, null])
	for (var i = missingPoints; i < this._points; ++i)
		pairs.push([i, this._data[i]])
	
	this._plot.setData([ pairs ]);
	this._plot.draw();
}

livePlot.prototype.addPoint = function(point){
	this._data.push(point);
	this._data.shift();
	this.refreshDraw();
}

/* / END LIVE PLOT */


var packetCallbacks = new Array();
function regPacketId(id, func){
	regPacketRange(id, id, func);
}

function regPacketRange(minId, maxId, func){
	packetCallbacks.push([minId, maxId, func]);
}

$(document).ready(function(){
	initializeConnection();
	setInterval("updateConnectionStatus()", 100);
	streamPackets(function(packet) {
		gotPacket(packet);
		for(var i = 0; i < packetCallbacks.length; i++){
			if(packet.id >= packetCallbacks[i][0] && packet.id <= packetCallbacks[i][1]){
				packetCallbacks[i][2](packet);
			}
		}
	});
});


function decimalToHex(d, padding) {
    var hex = Number(d).toString(16).toUpperCase();
    padding = typeof (padding) === "undefined" || padding === null ? padding = 2 : padding;

    while (hex.length < padding) {
        hex = "0" + hex;
    }

    return hex;
}