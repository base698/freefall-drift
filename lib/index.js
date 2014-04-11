
var headdown = new Image();
headdown.src = '/img/headdown.png';
var belly = new Image();
belly.src = '/img/belly.png';
var canopy = new Image();
canopy.src = '/img/canopy.png';
var airplaneImg = new Image();
airplaneImg.src = '/img/airplane.png';

var bellyD = 1.4;
var headdownD = 1.0;

angular.module('simulation', ['ngRoute'])
.service('Load', [], function() {
  console.log(arguments);
})
.controller('SimulationCtrl', function($scope, $routeParams) {
  var exitAltitude = 13000;
  var ftPerSecond = $scope.ftPerSecond = 5280 / 60 / 60;
  var G = 3.28084 * 9.8;
  var airplaneSpeed = 144; // in ft/second
  // Example CA 4-8-14
  /*
  var winds = {
    0: 5,
    3000: 15,
    6000: 20,
    9000: 25,
    12000: 30
  };
  */
  
  // Example NC 4-8-14
  /*
  var winds = $scope.winds = {
     0: 15,
     3000: 20,
     6000: 45,
     9000: 50,
     12000: 65
  };
  */

  // Example Simulation from: http://www.omniskore.com/freefall_drift2.html
  var winds = $scope.winds = {
     0: 0,
     3000: 0,
     6000: 35,
     9000: 35,
     12000: 35
  };

  /*
  var winds = $scope.winds = {
     0: 0,
     3000: 0,
     6000: 50,
     9000: 60,
     12000: 65
  };
  */

  var windAltitude = $scope.windAltitude = [0, 3000, 6000, 9000, 12000];

  $scope.simulationConfig = {
    fastFallFirst: false,
    numJumpers: 6,
    groupSwitch: 3,
    openingAltitude: 2500,
    timeBetweenGroups: 8
  };
  
  $scope.airplaneLoad = {
    airplane: {x: 0, xSpeed: airplaneSpeed, altitude: exitAltitude}
  };

  $scope.changeSpeed = function(jumper) {
    var fastFall = 180 * ftPerSecond;
    var slowFall = 115 * ftPerSecond;
    var terminal = jumper.terminal;
    jumper.terminal = (terminal == fastFall)?slowFall:fastFall;
  };

  $scope.simulationStart = function() {
    $scope.startTime = new Date().getTime();
    $scope.groupsUnderCanopy = 0;
    $scope.canopiesUnder1k = 0;
    $scope.running = true;
    simulation($scope.airplaneLoad.groups);
  }

  _.each(_.keys($scope.simulationConfig), function(key) {
    $scope.$watch('simulationConfig.'+key, function() {
      var groups = getInitConfig($scope.simulationConfig);
      $scope.airplaneLoad.groups = groups;
      $scope.airplaneLoad.exitAltitude = exitAltitude;
    });
  });

  function getInitConfig(config) {
    var numJumpers = Number(config.numJumpers) || 15;
    var groupSwitch = Number(config.groupSwitch) || 6;
    var openingAltitude = Number(config.openingAltitude) || 3200;
    var timeBetweenGroups = Number(config.timeBetweenGroups) || 8;
    var exitAltitude = Number(config.exitAltitude) || 13000;
    var airplaneSpeed = 144; // in ft/second
    //var airplaneSpeed = 175; // in ft/second
    var windAtAlt = winds[12000] * ftPerSecond;
    airplaneSpeed -= windAtAlt;
    $scope.airplaneLoad.airplane.xSpeed = airplaneSpeed;

    var fastFall = 180 * ftPerSecond;
    var slowFall = 115 * ftPerSecond;

    var id = 1;
    var jumpers = _.map(_.range(0, numJumpers), function(idx) {
      return {
        id: id++,
        altitude: exitAltitude,
        x: 0,
        z: 0,
        vSpeed: 0,
        xSpeed: airplaneSpeed,
        zSpeed: 0,
        timeBetweenGroups: timeBetweenGroups,
        openingAltitude: openingAltitude
      }
    });

    var first = jumpers.slice(0, groupSwitch);
    var last = jumpers.slice(groupSwitch);
    first = getGroups(first);
    last = getGroups(last);
    if(config.fastFallFirst) {
      setTerminal(first, fastFall);
      setTerminal(last, slowFall);
    } else {
      setTerminal(first, slowFall);
      setTerminal(last, fastFall);
    }
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
        j.color = (speed < (150 * ftPerSecond))?'rgb(52,102,0)':'rgb(102,52,0)';
        return j;
      });
      return j;
    });
  }

  function groupsUnderCanopy(groups) {
      var underCanopy = 0;
    _.each(groups, function(g) {
       var jumper = _.first(g);
       underCanopy += (jumper.altitude != 0 && jumper.openingAltitude > jumper.altitude)?1:0;
    });
    return underCanopy;
  }

  $scope.canopiesUnder1k = 0;
  var requestId;
  function simulation(groups) {
    var last;
    var start = new Date().getTime();
    var doHeatmapThrottled = _.throttle(doHeatmap, 200);
    var getHorizontalDistancesThrottled = _.throttle(getHorizontalDistances, 200);
    cancelAnimationFrame(requestId);
    requestId = requestAnimationFrame(step);

    function step(timestamp) {
      if(!last) {
        last = timestamp;  
        requestId = requestAnimationFrame(step);
      }
      var delta = (timestamp - last) / 1000;
      updateGroups(groups, delta, (new Date().getTime() - start)/1000);
      updateAirplane(delta);
      drawGroups(groups);
      doHeatmapThrottled(groups);

      $scope.$apply(function() {
        $scope.groupsUnderCanopy = groupsUnderCanopy(groups);
        $scope.canopiesUnder1k = Math.max($scope.canopiesUnder1k, getCanopiesUnder1k(groups));
        $scope.timeRunning = (new Date().getTime() - $scope.startTime) / 1000;
        $scope.horizontalDistances = getHorizontalDistancesThrottled(groups);
      });
      if(!allOnGround(groups)) {
        requestId = requestAnimationFrame(step);
      } else {
        $scope.running = false;
      }
      last = timestamp;
    }
  }

  function getHorizontalDistances(groups) {
    var distances = binaryHeap(function(a, b) { return a.distance < b.distance; });
    var seen = {};
    _.each(groups, function(outer) {
      var jumperTwo = _.first(outer)
      _.each(groups, function(inner) {
        var jumperOne = _.first(inner)
        if(jumperOne.id === jumperTwo.id || seen[jumperOne.id+' '+jumperTwo.id]) {
          return;
        }
        seen[jumperOne.id+' '+jumperTwo.id] = true;
        seen[jumperTwo.id+' '+jumperOne.id] = true;
        var dist = Math.abs(jumperOne.x - jumperTwo.x);
        if(dist > 0) {
          distances.push({distance: dist});
        }
      });
    });
    return _.uniq(distances.first(10), function(d) { return d.distance; }); 
  }


  function getCanopiesUnder1k(groups) {
    var count = 0;
    _.each(groups, function(group) {
      var jumper = _.first(group);
      if(jumper.altitude <= 1000 && jumper.altitude != 0) {
        count++;
      }
    });
    return count;
  }

  function drawGroups(groups) {
    var canvas = document.getElementById('screen');
    var canvasElm = angular.element(canvas);
    var ctx = canvas.getContext('2d');
    var width = canvas.width, height = canvas.height;
    ctx.strokeStyle = "black";
    ctx.clearRect(0, 0, width, height);
    var yRatio = Number(height) / exitAltitude; 
    var xRatio = Number(width) / 7000;

    var points = _.chain(groups).filter(function(group) {
      return _.first(group).altitude > 0 && _.first(group).altitude !== exitAltitude;
    }).map(function(group) {
      var jumper = _.first(group); 
      var img = (jumper.terminal > 140 * ftPerSecond)?headdown:belly;
      img = (jumper.altitude < jumper.openingAltitude)?canopy:img;
      var x = (200 + jumper.x * xRatio);
      var y = yRatio * (exitAltitude - jumper.altitude);
      return [x, y, img];
    }).value();

    var minX = _.min(points, function(p) {
      return p[0];
    })[0];

    var airplane = $scope.airplaneLoad.airplane;
    ctx.drawImage(airplaneImg, 200+airplane.x * xRatio, -15);
    _.each(points, function(p) {
        ctx.drawImage(p[2], p[0], p[1]);
    });
  }

  function getWind(jumper) {
    if(jumper.altitude > 12000) {
      return winds[12000];
    } else if(jumper.altitude > 9000) {
      return winds[9000];
    } else if(jumper.altitude > 6000) {
      return winds[6000];
    } else {
      return winds[3000];
    }
  }

  function updateAirplane(delta) {
    $scope.airplaneLoad.airplane.x += $scope.airplaneLoad.airplane.xSpeed * delta;
  };

  // TODO: clean up
  function updateGroups(groups, delta, seconds) {

    _.each(groups, function(group, idx) {

      _.each(group, function(jumper) {
        var wind = -1 * getWind(jumper) * ftPerSecond;
        var hasExited = (idx * jumper.timeBetweenGroups) < seconds;
        var where, throwFactor;
        if(hasExited) {
          if(jumper.altitude > jumper.openingAltitude) {
            where = 'freefall';
            jumper.vSpeed = Math.min(jumper.vSpeed + (G * delta), jumper.terminal);
            // TODO: make more real
            throwFactor = (jumper.terminal > 130)?3:1; 
            if(wind < 0) {
              jumper.xSpeed += wind * delta / throwFactor;
              jumper.xSpeed = Math.max(jumper.xSpeed, wind);
            } else {
              jumper.xSpeed += -wind * delta / throwFactor;
              jumper.xSpeed = Math.min(jumper.xSpeed, wind);
            }
            if(exitAltitude - jumper.altitude > 2000) {
              var diff = jumper.xSpeed - wind;
              jumper.xSpeed -= diff * delta;
            }
            
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

  function getGroups(jumpers, maxGroupSize) {
    var groups = [];
    
    var groupSize = 1;
    while(jumpers.length > 0) {
      groups.push(jumpers.splice(0, groupSize));
    }

    return groups.sort(function(a, b) { return b.length - a.length});
  }

  function doHeatmap(groups) {
    var heatmapElm = document.getElementById("heatmap");
    var height = angular.element(heatmapElm)[0].offsetHeight;
    var config = {
        element: heatmapElm,
        radius: 20,
        opacity: 70
    };

    //creates and initializes the heatmap
    var heatmap = h337.create(config);
    heatmap.clear();
    var yRatio = Number(height) / exitAltitude; 
    var data = _.chain(groups)
      .filter(function(g) {
        var jumper = _.first(g);
        return jumper.altitude < 2500 && jumper.altitude != 0;
      }).map(function(g) {
        var length = g.length;
        var jumper = _.first(g);
        var altitude = jumper.altitude;
        return { x: 20, y: Math.round(yRatio * (exitAltitude - altitude)), count: 2};
      }).value();


    if(data.length == 0) {
      return;
    }     

    // let's get some data
    var dataSet = {
        max: 3,
        data: data /*[{x: 20, y: 120, count: 4},{x: 20, y: 130, count: 4},{x: 20, y: 130, count: 4},{x: 20, y: 150, count: 4}]*/
    };
 
    heatmap.store.setDataSet(dataSet);
  }


})
