var ftPerSecond = 5280 / 60 / 60;
var exitAltitude = 13000;
var airplaneSpeed = 100 * ftPerSecond;
// Example CA 4-8-14
var winds = {
  0: 5,
  3000: 15,
  6000: 20,
  9000: 25,
  12000: 30
};
// Example NC 4-8-14
// var winds = {
//   0: 20,
//   3000: 20,
//   6000: 45,
//   9000: 50,
//   12000: 65
// };


var numJumpers = 15;
var groupSwitch = 6;
var groupSize = 4;
var openingAltitude = 3200;
var timeBetweenGroups = 8;

var fastFall = 150 * ftPerSecond;
var slowFall = 115 * ftPerSecond;
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
  var first = jumpers.slice(0, groupSwitch);
  var last = jumpers.slice(groupSwitch);
  first = getGroups(first, groupSize);
  last = getGroups(last, groupSize);
  setTerminal(first, fastFall);
  setTerminal(last, slowFall);
  return _.filter(first.concat(last), function(g) { return g.length > 0});
}

function allOnGround(groups) {
  return _.every(groups, function(group) {
    return _.every(group, function(jumper) {
      return jumper.altitude <= 0;
    });
  });
}

function setTerminal(groups, speed) {
  return _.map(groups, function(group) {
    return _.map(group, function(j) { 
      j.terminal = speed;
      return j;
    });
    return j;
  });
}

function simulation(jumpers) {
  var groups = getInitConfig();
  console.log(groups);

  var last;
  var start = new Date().getTime();
  requestAnimationFrame(step);
  function step(timestamp) {
    if(!last) {
      last = timestamp;  
      requestAnimationFrame(step);
    }
    var delta = (timestamp - last) / 1000;
    updateGroups(groups, delta, (new Date().getTime() - start)/1000);
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
  var xRatio = Number(width) / 8000;
  _.each(groups, function(group) {
      var jumper = _.first(group); 
      ctx.fillStyle = (jumper.terminal == fastFall)?'rgb(52,102,0)':'rgb(102,52,0)';
      
      ctx.beginPath();
      ctx.arc(100 + jumper.x * xRatio, yRatio * (exitAltitude - jumper.altitude), 4, 0, Math.PI*2, true); 
      ctx.closePath();
      ctx.fill();
  });
}

function getWind(jumper) {
  var altitudes = _.keys(winds);
  var altAt = _.find(altitudes, function(altitude) {
    return jumper.altitude >= Number(altitude);
  });
  return winds[altAt];
}

function updateGroups(groups, delta, seconds) {

  _.each(groups, function(group, idx) {
    var hasExited = (idx * timeBetweenGroups) < seconds;

    _.each(group, function(jumper) {
      var wind = getWind(jumper) * ftPerSecond;
      var where;
      if(hasExited) {
        if(jumper.altitude > jumper.openingAltitude) {
          where = 'freefall';
          jumper.vSpeed = Math.min(jumper.vSpeed + (G * delta), jumper.terminal);
          jumper.xSpeed += -wind * delta;
          jumper.xSpeed = Math.max(-wind, jumper.xSpeed);
        } else {
          where = 'canopy';
          jumper.vSpeed = 15 * ftPerSecond;
        }
      }  else {
        where = 'plane';
        jumper.vSpeed = 0;
      }
      jumper.x += jumper.xSpeed * delta;
      jumper.altitude += -1 * (jumper.vSpeed * ftPerSecond * delta);
      jumper.altitude = Math.max(jumper.altitude, 0);
    });
  });
  
}

function getGroups(jumpers, groupSize) {
  var groups = [];
  
  while(jumpers.length > 0) {
    groups.push(jumpers.splice(0, groupSize--));
  }

  return groups;
}


