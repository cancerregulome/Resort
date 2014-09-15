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
        this.Resort = factory($, _, d3);
    }
}(this, function ($, _, d3) {
    'strict mode';

    var Resort = function (options) {
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

            row_selector : '.resort-row',
            enable_select : false,
            enable_hover : false
        };

        var config = _.extend(defaults, options);

        var plotWidth;

        var heatmapData = [];
        var parentEl;
        var sortRows = [],
            columnOrder;

        var selectedColumns, highlightRegion;
        var colorscale_fn;

        var groupMembership = [];
        var groupExtents = [];
        var isGrouped = false;

        var valid_events = ['click', 'brush', 'hover'];
        var events = {};

        function PrimitiveBrush(context) {
            'strict mode';
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
                var pt = this.workingStrokes[j];
                this.ctx.strokeRect(pt0.x, -1,  pt.x - pt0.x, bar_height+1);
            }

        };

        function initializeBrush(canvasSelection) {
               // Set up brush to listen to events
            var canvas = d3.this(canvasSelection);
            var brush = new PrimitiveBrush(canvas.getContext('2d'));

            canvas.addEventListener('mousedown', brush.start.bind(brush));
            canvas.addEventListener('mousemove', brush.move.bind(brush));
            canvas.addEventListener('mouseup', brush.end.bind(brush));

        }

        function getElementPosition(el) {
            var node = el.node();
            var body = d3.select('body').node();
         
            for (var lx = 0, ly = 0;
                 node != null && node != body;
                 lx += (node.offsetLeft || node.clientLeft), ly += (node.offsetTop || node.clientTop), node = (node.offsetParent || node.parentNode))
                ;
            return {left: lx, top: ly, bottom: ly + config.bar_height, right: lx + plotWidth};
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

        function dispatch (event) {
                var extra_args = Array.prototype.slice.call(arguments, 1);

                if (event in events) {
                    _.each(events[event], function(ev) {
                        ev.apply(scope, extra_args);
                    });
                }
        }

        function initializeHover (canvasSelection) {
               // Set up hover listener
            canvasSelection.on('mouseover', function(data, idx) {
                var canvas = d3.select(this);
                var canvasPosition = getElementPosition(canvas);
                var mouse = d3.mouse(this),
                    x = mouse[0],
                    y = mouse[1];

                var groupBoundingBox = getGroupBoundingBox(canvas, x);
                dispatch('hover', groupBoundingBox);

            });

        }

        // calculate the screen position extents of each data grouping.

        function setGroupExtents(sortRow, valueOrder) {

                //  the first specified grouping, 
                // maps natural data order to membership of first selected row
                groupMembership = heatmapData[sortRow].map(function(val) { return valueOrder.indexOf(val); });
                groupExtents = valueOrder.map(function(val, index) {
                    return {
                        index: index,
                        value: val,
                        start: null,
                        end: null
                    };
                });
        }

        // creates an ordered list of columns from 0 to length(longest row)

        function getDefaultColumnOrder() {
            var longest = heatmapData.reduce(function(memo, row) { return _.max([memo, row.length]); }, 0);
            return _.range(0, longest);
        }

        //parameter: the raw value index, the ordered display index
        //returns screen position

        function datapointToPosition( valueIndex, order ) {
            var position = (order * (config.bar_width + config.bar_padding));
            if ( groupMembership[valueIndex] ) {
                position += ( groupMembership[valueIndex] * config.group_padding );
            }
            return position;
        }

        //returns datapoint index

        function positionToDatapointIndex( position ) {
            var orderIndex = position;
            if (isGrouped) {
                var group = positionToGroup(position);
                if (group) {
                    orderIndex -= ( group.index * config.group_padding);
                }
            }
            orderIndex = orderIndex / (bar_width + bar_padding);
            return Math.floor(orderIndex);
        }

        //returns group object or null

        function positionToGroup ( position ) {
            var group = null;
            if (isGrouped) {
                group = groupExtents.filter(function(extent) { return extent.start <= position && extent.end >= position;})[0];
            }
            return group;
        }

        function drawRow (data, idx) {
                
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
                    _.each(columnOrder, function(valueIndex, order, array) {
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

            }

            function globallyUniqueValues(matrix) {
                return _.reduce(matrix, function(previous, current){
                    return _.union(previous, _.uniq(current));
                }, []);
            }

            function get_colorscale_fn (matrix) {
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
            }


            /* resolveRowIndex
               translates a generic row identifier (index or label) into the row index
               input: rowIdentifier (String or Number) : uniquely identifies a row of the data
                output: Number, index of row data.  null if identifier is invalid.
            */

            function resolveRowIndex(rowIdentifier) {
                var rowIndex = null;
                if (_.isFinite(rowIdentifier) && heatmapData[rowIdentifier] !== undefined) {
                    return rowIdentifier;
                } else if (_.isString(rowIdentifier) && (rowIndex = config.row_labels.indexOf(rowIdentifier) ) >= 0 ) {
                    return rowIndex;
                }
                return rowIndex;
            }

            function _setOptions (options) {
                config = _.extend(config, options);
                this.redraw();
            }

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

                columnOrder =  columnOrder || getDefaultColumnOrder();

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

            on: function(event, fn, scope) {
                var fn_scoped = fn;
                if (scope) { 
                    fn_scoped = fn.bind(scope);
                }

                if (event in valid_events) {
                    console.warn('Resort: unexpected event type requested: ' + event);
                    return false;
                }
                if (!(event in events) ){
                    events[event] = [];
                }

                events[event].push(fn_scoped);
                return true;
            },

            off: function(event, fn) {
                if (event in events && fn in events[event]) {
                    var ev = event[events];
                    events[event] = ev.slice(0, i=ev.indexOf(fn)).concat(ev.slice(i +  1));
                }
            },

            // group Values By the Row
            // parameters
            // row : integer or String.  Indexes the row in the data matrix
            // sortIndex : the index of the sort rows
            // returns
            //  empty array if row cannot be sorted
            //  array of data indices in sorted order
            valueOrder: function(row, sortIndex) {
                var rowData, values, rowIndex;
                    cast = String;

                var sortRowNumber = sortIndex || 0;

               rowIndex = resolveRowIndex(row);
               
               if (rowIndex >= 0) {
                    rowData = heatmapData[rowIndex];
                    if (sortRows.length) {
                        sortRows[sortRowNumber] = rowIndex;
                    } else {
                        sortRows.push(rowIndex);
                    }
                } else {
                    console.warn('Resort.valueOrder: Could not find data row to sort on.');
                    return [];
                }

                var uniqueData = _.uniq(rowData)
                    
                if (_.every(uniqueData, _.isNumber)){
                    cast = Number;
                } else {
                    cast = String;
                }
                
                if (config.value_order) {

                    return _.chain(uniqueData)
                                    .intersection(config.value_order, uniqueData)
                                    .sortBy( function(val) { return config.value_order.indexOf(val); })
                                    .value();

                 } else { //order by largest number of values to smallest
                    return _.chain(rowData)
                                    .countBy(function(val) { return val;})
                                    .pairs()
                                    .map(function(arrVal){ return [cast.call(this, arrVal[0]), arrVal[1]]; })
                                    .sortBy(function(arrVal) { return arrVal[1]; })
                                    .map(function(arrVal) { return arrVal[0]; })
                                    .reverse()
                                    .value();
                }

            },

            groupByRow: function(rowToGroupOn) {

                var rowArray = rowToGroupOn;

                if ( !_.isArray(rowToGroupOn) ) {
                    rowArray = [rowToGroupOn];
                }

                rowArray = rowArray.map(resolveRowIndex);

                if ( _.isEqual(sortRows, rowArray) ) { return; }
                
                sortRows = rowArray;

                var valueOrders = sortRows.map( this.valueOrder.bind(this) );

                var rowData = heatmapData[sortRows[0]];
                
                columnOrder = _.sortBy(getDefaultColumnOrder(), function(colIndex) {
                            return valueOrders[0].indexOf( rowData[colIndex] );
                        });

                setGroupExtents(sortRows[0], valueOrders[0]);
                
                isGrouped = true;

                this.redraw();

            },

            groupByRows: function(rowsToGroupOn) {

                if (rowsToGroupOn === undefined || !_.isArray(rowsToGroupOn) || rowsToGroupOn.length < 1) { 
                    console.warn('Resort.groupByRows expects an array of row indices or labels.'); 
                    return;
                }

                if (rowsToGroupOn.length === 1) { 
                    this.groupByRow(rowsToGroupOn);
                    return;
                }

                var rowArray = rowsToGroupOn.map(resolveRowIndex);
                
                if ( _.isEqual(sortRows, rowArray) ) { return; }
                
                //update global closure variable.  array of row indices to sort/group on
                sortRows = rowsToGroupOn;


                var valueOrders = sortRows.map( this.valueOrder.bind(this) );

                var value, arrayPtr;
                var subArrayIndex;

                //hierarchical sort!
                var rowLength = heatmapData[0].length;
                //initialize root node to array for first value of first sort row
                var nestedOrder = [];
                
                _.each(_.range(0, rowLength), function( colIdx ) {
                    //reset pointer to top of tree
                    arrayPtr = nestedOrder;
                    
                    //for each row to sort on
                    _.each(_.range(0, sortRows.length), function( sortIdx ) {
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

                setGroupExtents(sortRows[0], valueOrders[0]);
                
                isGrouped = true;

                this.redraw();

           }
        };
    };

    return Resort;
}));