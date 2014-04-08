var exitAltitude = 13000;
var airplaneSpeed = 100 * 5280 / 60 / 60;
var winds = {
  0: 10,
  3000: 15,
  6000: 40,
  9000: 50,
  12000: 70
};

var numJumpers = 15;
var groupSwitch = 6;
var groupSize = 4;
var openingAltitude = 3200;
var timeBetweenGroups = 3;

var fastFall = 150 * 5280 / 60 / 60;
var slowFall = 115 * 5280 / 60 / 60;
var G = 3.28084 * 9.8;

simulation(getInitConfig())


function getInitConfig() {
  var jumpers = _.map(_.range(0, numJumpers), function(idx) {
    return {
      altitude: exitAltitude,
      x: 0,
      z: 0,
      vSpeed: 0,
      xSpeed: airplaneSpeed,
      zSpeed: 0,
      openingAltitude: openingAltitude
    }
  });
  var first = _.first(jumpers, groupSwitch);
  var last = _.last(jumpers, groupSwitch);
  
  return [getGroups(first, groupSize), getGroups(last, groupSize)]; 
}

function allOnGround(groups) {
  return _.every(groups, function(group) {
    return _.every(group, function(jumper) {
      return jumper.altitude <= 0;
    });
  });
}

function simulation(jumpers) {
  var config = getInitConfig();
  var first = config[0];
  var second = config[1];
  first = _.map(first, function(groups) {
    return _.map(groups, function(j) { 
      j.terminal = fastFall;
      return j;
    });
    return j;
  });
  second = _.map(second, function(groups) {
    return _.map(groups, function(j) { 
      j.terminal = slowFall;
      return j;
    });
    return j;
  });

  var groups = first.concat(second);
  groups = _.filter(groups, function(g) { return g.length == 3});
  console.log(groups);
  var last;
  var timeRunning = 0;
  var start = new Date().getTime();
  requestAnimationFrame(step);
  function step(timestamp) {
    if(!last) {
      last = timestamp;  
      requestAnimationFrame(step);
    }
    var delta = (timestamp - last) / 1000;
    updateGroupsVertical(groups, delta, (new Date().getTime() - start)/1000);
    drawGroups(groups);
    var jumperOne = _.first(_.first(groups));
    
    var groupsUnderCanopy = 0;
    _.each(groups, function(g) {
       var jumper = _.first(g);
        groupsUnderCanopy += (jumper.altitude != 0 && jumper.openingAltitude > jumper.altitude)?1:0;
    });

    document.getElementById('underCanopy').innerHTML = groupsUnderCanopy + ' groups under canopy ';
    // document.getElementById('x').innerHTML = jumperOne.x;
    if(!allOnGround(groups)) {
      requestAnimationFrame(step);
    }
    last = timestamp;
  }
}

function drawGroups(groups) {
  var canvas = document.getElementById('screen');
  var ctx = canvas.getContext('2d');
  var width = canvas.width, height = canvas.height;
  ctx.strokeStyle = "black";
  ctx.clearRect(0, 0, width, height);
  
  var yRatio = Number(height) / exitAltitude; 
  var xRatio = Number(width) / 5000;
  _.each(groups, function(group) {
      var jumper = _.first(group); 
      ctx.fillStyle = (jumper.terminal == fastFall)?'rgb(102,204,0)':'rgb(204,102,0)';
      
      ctx.beginPath();
      ctx.arc(100 + jumper.x * xRatio, yRatio * (exitAltitude - jumper.altitude), 4, 0, Math.PI*2, true); 
      ctx.closePath();
      ctx.fill();
  });
}

function getWind(jumper) {
  var altitudes = _.keys(winds);
  var altAt = _.find(altitudes, function(altitude) {
    return jumper.altitude > Number(altitude);
  });
  return winds[altAt];
}


var timeRunning = 0;
function updateGroupsVertical(groups, delta, seconds) {

  _.each(groups, function(group, idx) {
    document.getElementById('d').innerHTML = seconds + 's';
    var hasExited = (idx * timeBetweenGroups) < seconds;
    _.each(group, function(jumper) {
      var wind = getWind(jumper) * 5280 / 60 / 60;
      if(hasExited && jumper.altitude > jumper.openingAltitude) {
        jumper.vSpeed = Math.min(jumper.vSpeed + (G * delta), jumper.terminal);
        jumper.xSpeed += -wind * delta;
        jumper.xSpeed = Math.max(-wind, jumper.xSpeed);

      } else if(jumper.altitude < jumper.openingAltitude) {
        jumper.vSpeed = 15 * 5280 / 60 / 60;
      }
      jumper.x += jumper.xSpeed * delta;
      jumper.altitude += -jumper.vSpeed * delta;
      jumper.altitude = Math.max(jumper.altitude, 0);
    });
  });
  
}

function getGroups(jumpers, groupSize) {
  var groups = [];
  while(jumpers.length > 0) {
    groups.push(_.first(jumpers, groupSize));
    jumpers = _.last(jumpers, groupSize--);
  }

  return groups;
}


