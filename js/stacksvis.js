(function (root, factory) {
    if (typeof exports === 'object' && root.require) {
        module.exports = factory(require("jquery"), require("underscore"), require("d3"));
    } else if (typeof define === "function" && define.amd) {
        // AMD. Register as an anonymous module.
        define(["jquery", "underscore", "d3"], function ($, _, d3) {
            // Use global variables if the locals are undefined.
            return factory($ || root.$, _ || root._, d3 || root.d3);
        });
    } else {
        // RequireJS isn't being used. Assume underscore and d3 are loaded in <script> tags
        this.Stacksvis = factory($, _, d3);
    }
}(this, function ($, _, d3) {
    'strict mode';

    var Stacksvis = function (options) {
        var defaults = {
            bar_height: 20,
            bar_width: 0.5,
            bar_padding: null,

            group_padding : 0,

            plot_width: null,
            
            row_labels: [],

            colorscale: [],
            colormap : {},
            highlight: {
                bar_height: 7,
                fill: "red"
            },

            row_selector : '.s-row',
            enable_select : false,
            enable_hover : false
        };

        var config = _.extend(defaults, options);

        var plotWidth;

        var heatmapData = [];
        var parentEl;
        var sortRows, columnOrder;

        var selectedColumns, highlightRegion;
        var colorscale_fn;

        var groupMembership = [];
        var groupExtents = [];
        var isGrouped = false;

        function PrimitiveBrush(context) {
            if (!(context instanceof CanvasRenderingContext2D)) {
                throw new Error('No 2D rendering context given!');
            }

            this.ctx = context;
            this.strokes = [];
            this.strokeIndex=0;
            this.workingStrokes=[];
            this.lastLength=0;
            this.isTouching = false;

            // init context
            this.ctx.strokeStyle = '#000';
            this.ctx.lineWidth = '0';
            this.ctx.lineCap = this.ctx.lineJoin = 'round';

            // start the drawing loop
            this._draw();
        }

        /**
         * Begins a new stroke
         * @param  {MouseEvent} event
         */
        PrimitiveBrush.prototype.start = function (event) {
            var x=event.layerX;
            this.workingStrokes=[{x:x}];
            this.strokes.push(this.workingStrokes);
            this.lastLength=1;
            this.isTouching = true;
        };

        /**
         * Moves the current position of our brush
         * @param  {MouseEvent} event
         */
        PrimitiveBrush.prototype.move = function (event) {
            if(!this.isTouching){return;}
            var x=event.layerX;
            this.workingStrokes.push({x:x});
        };

        /**
         * Stops a stroke
         * @param  {MouseEvent} event
         */
        PrimitiveBrush.prototype.end = function (event, foo) {
            this.move(event);
            this.isTouching = false;
        };

        PrimitiveBrush.prototype._draw = function () {

            requestAnimationFrame(this._draw.bind(this));

            // save the current length quickly (it's dynamic)
            var length=this.workingStrokes.length;

            // return if there's no work to do
            if( length <= this.lastLength ){ return; }
            var startIndex = this.lastLength - 1;

            this.lastLength = length;

            var pt0 = this.workingStrokes[startIndex];

            this.ctx.strokeStyle = "rgba(180,180,180,1.0)";
            this.ctx.filleStyle = "none";

            for(var j = startIndex; j < this.lastLength; j++){

                var pt=this.workingStrokes[j];

                this.ctx.strokeRect(pt0.x, -1,  pt.x - pt0.x, bar_height+1);

            }

        };

        var initializeBrush = function (canvasSelection) {
               // Set up brush to listen to events
            var canvas = d3.this(canvasSelection);
            var brush = new PrimitiveBrush(canvas.getContext('2d'));

            canvas.addEventListener('mousedown', brush.start.bind(brush));
            canvas.addEventListener('mousemove', brush.move.bind(brush));
            canvas.addEventListener('mouseup', brush.end.bind(brush));

        };

        function getElementPosition(el) {
            var node = el.node();
            var body = d3.select('body').node();
         
            for (var lx = 0, ly = 0;
                 node != null && node != body;
                 lx += (node.offsetLeft || node.clientLeft), ly += (node.offsetTop || node.clientTop), node = (node.offsetParent || node.parentNode))
                ;
            return {left: lx, top: ly, bottom: ly + config.bar_height, right: lx + plotWidth};
        }

        function orderIndexToValueIndex(orderIndex) {
            return columnOrder.indexOf(orderIndex);
        }

        function valueIndexToSortedValue(valueIndex) {
            return heatmapData[sortRows[0]][valueIndex];
        }

        function calculateGroupExtents() {
            var groupSizes = _.countBy(heatmapData[sortRows[0]], function(val) { return val; });
            var curPosition = 0;
            var width = 0;
            //groupExtents is sorted by display group. left to right.
            _.each(groupExtents, function(group, index, groups) {
                group.start = curPosition;
                width = groupSizes[group.value] * (config.bar_width + config.bar_padding);
                group.end = width + group.start;
                curPosition += width + config.group_padding;
            });
        }

        function getGroupBoundingBox(canvas, position) {
            var canvasPosition = getElementPosition(canvas);
         
            //get sorted value of current position
            var group = positionToGroup(position);

            if (!canvasPosition || ! group) { return null;}
      
            return {
                    left: group.start,
                    right : group.end,
                    top : canvasPosition.top,
                    bottom : canvasPosition.bottom
                };
        }

        var initializeHover = function (canvasSelection) {
               // Set up hover listener
            canvasSelection.on('mouseover', function(data, idx) {
                var canvas = d3.select(this);
                var canvasPosition = getElementPosition(canvas);
                var mouse = d3.mouse(this),
                    x = mouse[0],
                    y = mouse[1];
              
                console.log("Heatmap test mode:  Hover detected on group at location: " + JSON.stringify(getGroupBoundingBox(canvas, x)) );

            });

        };

        //parameter: the raw value index, the ordered display index
        //returns screen position

        var datapointToPosition = function( valueIndex, order ) {
            var position = (order * (config.bar_width + config.bar_padding));
            if ( groupMembership[valueIndex] ) {
                position += ( groupMembership[valueIndex] * config.group_padding );
            }
            return position;
        };

        //returns datapoint index

        var positionToDatapointIndex = function( position ) {
            var orderIndex = position;
            if (isGrouped) {
                var group = positionToGroup(position);
                if (group) {
                    orderIndex -= ( group.index * config.group_padding);
                }
            }
            orderIndex = orderIndex / (bar_width + bar_padding);
            return Math.floor(orderIndex);
        };

        //returns group object or null

        var positionToGroup = function( position ) {
            var group = null;
            if (isGrouped) {
                group = groupExtents.filter(function(extent) { return extent.start <= position && extent.end >= position;})[0];
            }
            return group;
        };

        var drawRow = function (data, idx) {
                
                var bar_width = config.bar_width;
                var rowData = data || [];

                var bar_padding = config.bar_padding || 0;

                var group_padding = config.group_padding || 0;

                var groupPads = groupExtents.length - 1;

                var groupSpacing = isGrouped ? (groupPads * group_padding) : 0;

                if (config.plot_width !== null) {
                    plotWidth = config.plot_width;
                    bar_width = (config.plot_width / rowData.length) - bar_padding - (group_padding * groupPads);
                } else {
                    plotWidth = groupSpacing + ((bar_width + bar_padding) * rowData.length);
                }

                var visEl = d3.select(this);

                visEl.selectAll("*").remove();

                var canvasSelection = visEl.append('canvas')
                    .attr("width", plotWidth)
                    .attr("height", config.bar_height);

                var canvas = canvasSelection.node();
                var context = canvas.getContext('2d');
                context.fillStyle = '#FFFFFF';
                context.fillRect(0, 0, plotWidth, config.bar_height);

                var position;

                var extraPosition = columnOrder.length;

                d3.timer( function() {
                    _.forEach(columnOrder, function(valueIndex, order, array) {
                        context.fillStyle = colorscale_fn( data[valueIndex] );
                        context.fillRect( datapointToPosition(valueIndex, order), 0, bar_width, config.bar_height );
                    }, this);
                    return true;
                });

                if (config.enable_select) {
                    // canvasSelection.call(initializeBrush);
                }
                if (isGrouped && config.enable_hover) {
                    canvasSelection.call(initializeHover);
                }

            };

            var globallyUniqueValues = function(matrix) {
                return _.reduce(matrix, function(previous, current){
                    return _.union(previous, _.uniq(current));
                }, []);
            };

            var get_colorscale_fn = function (matrix) {
                var colorscaleFn;
                if (config.colormap) {
                    colorscaleFn = d3.scale.ordinal().domain(_.keys(config.colormap)).range(_.values(config.colormap));
                }
                else {
                var row_colorscale = (config.colorscale &&  config.colorscale.length > 1) ? config.colorscale : ["yellow", "blue"];
                // identify unique categorical values
                var values = globallyUniqueValues(matrix);
                  //map categorical values to static array of colors...

                    colorscaleFn = d3.scale.ordinal().domain(values).range(row_colorscale);
                }
                return function (val) {
                    return colorscaleFn(val);
                };
            };


            var _setOptions = function(options) {
                config = _.extend(config, options);
                this.redraw();
            };

        return {
            // data: [],
            // columns_by_groups: {},

            draw : function(el, matrix) {
                var self = this;
                if (el !== undefined) {
                        parentEl = d3.select(el);
                } else if (parentEl === undefined) {
                        parentEl = d3.select('body');
                }
                
                if (matrix !== undefined) {
                    heatmapData = matrix.map(function(val) {
                        if (val instanceof Array) {
                            return val.map( function(el) {
                                return el;
                            });
                        } else {
                            return [];
                        }
                    });
                    colorscale_fn = get_colorscale_fn(heatmapData);
                }

                var longest = heatmapData.reduce(function(memo, row) { return _.max([memo, row.length]); }, 0);
                columnOrder =  columnOrder || _.range(0, longest);

                var rows = parentEl
                        .selectAll(config.row_selector)
                        .data(heatmapData);

                var tagFn = function(selector) { };
                if (config.row_selector.indexOf('.')===0) {
                    tagFn = function(selector) {
                        selector.classed(config.row_selector.slice(1), true);
                    };
                }

                if (isGrouped) {
                    calculateGroupExtents();
                }

                rows
                    .enter()
                    .append('div')
                    .call(tagFn);
                
                rows.each(drawRow);
            },

            redraw : function() {
                this.draw();
            },

            setOptions : _.throttle(_setOptions, 40),

            groupByRows: function(rows) {
                
                var rowData, values,
                    cast = String;
                if ( sortRows === rows ) { return; }
                
                sortRows = rows;

                var valueOrders = new Array(sortRows.length);

                sortRows.forEach(function(row, sortIndex, sortArray){

                    if ( _.isNumber(row) && heatmapData[row] !== undefined) {
                        rowData = heatmapData[row];
                    } else if (typeof(row) === 'string' && heatmapData[config.row_labels.indexOf(row)] !== undefined) {
                        rowData = heatmapData[config.row_labels.indexOf(row)];
                        sortArray[sortIndex] = config.row_labels.indexOf(row);
                    } else {
                        return;
                    }

                    if (_.every(_.uniq(rowData), _.isNumber)){
                        cast = Number;
                    } else {
                        cast = String;
                    }
                    
                    if (config.value_order) {
                        valueOrders[sortIndex] = _.intersection(config.value_order, _.uniq(rowData));
                     } else { //order by largest number of values to smallest
                        orderValuesFn = _.identity;
                        valueOrders[sortIndex] = _.chain(rowData)
                                        .countBy(function(val) { return val;})
                                        .pairs()
                                        .map(function(arrVal){ return [cast.call(this, arrVal[0]), arrVal[1]]; })
                                        .sortBy(function(arrVal) { return arrVal[1]; })
                                        .map(function(arrVal) { return arrVal[0]; })
                                        .reverse()
                                        .value();
                    }
                });

                var value;
                var arrayPtr;
                var subArray;
                //hierarchical sort!
                if ( sortRows.length > 1 ) {
                    var row = heatmapData[sortRows[0]];
                    var rowLength = row.length;
                    //initialize root node to array for first value of first sort row
                    var nestedOrder = [];
                    
                    _.each(_.range(0, rowLength), function( colIdx ){
                        //reset pointer to top of tree
                        arrayPtr = nestedOrder;
                        
                        //for each row to sort on
                        _.each(_.range(0, sortRows.length), function( sortIdx ){
                            //get sample value for currently sorting row
                            value = heatmapData[sortRows[sortIdx]][colIdx];
                            // get pointer to sorting branch (based on value)
                            subArrayIndex = valueOrders[sortIdx].indexOf(value);
                            //initialize sub array if necessary
                            if (arrayPtr[subArrayIndex] === undefined) {
                                arrayPtr[subArrayIndex] = [];
                            }
                            // point to correct subarray
                            arrayPtr = arrayPtr[subArrayIndex];
                            });
                        //add the sample to the tree node
                        arrayPtr.push(colIdx);
                    });
                    //flatten the tree to get global order
                    columnOrder = _.flatten(nestedOrder, false);
                } else {  //shortcut if only one row to sort on.
                    columnOrder = _.sortBy(columnOrder, function(colIndex) {
                            return valueOrders[0].indexOf( rowData[colIndex] );
                        }
                    ).reverse();
                }

                // for the first specified grouping, 
                // maps natural data order to membership of first selected row
                groupMembership = heatmapData[sortRows[0]].map(function(val) { return valueOrders[0].indexOf(val); });
                groupExtents = valueOrders[0].map(function(val, index) {
                    return {
                        index: index,
                        value: val,
                        start: null,
                        end: null
                    };
                });
                
                isGrouped = true;

                this.redraw();

           }
        };
    };

    return Stacksvis;
}));