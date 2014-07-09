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
            plot_width: null,
            bar_width: 0.5,
            row_labels: [],

            colorscale: [],
            highlight: {
                bar_height: 7,
                fill: "red"
            }
        };

        var config = _.extend(defaults, options);

        var data = [];
        var parentEl;
        var sortRows, columnOrder;

        var selectedColumns, highlightRegion;

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
            var x=event.clientX-offsetX;
            var y=event.clientY-offsetY;
            this.workingStrokes=[{x:x,y:y}];
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
            var x=event.clientX-offsetX;
            var y=event.clientY-offsetY;
            this.workingStrokes.push({x:x,y:y});
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

            this.ctx.beginPath();
            this.ctx.moveTo(pt0.x,pt0.y);

            for(var j = startIndex; j < this.lastLength; j++){

                var pt=this.workingStrokes[j];

                this.ctx.lineTo(pt.x,pt.y);

            }

            this.ctx.stroke();

        };


        var initializeBrush = function (canvas) {
               // Set up brush to listen to events
            var brush = new PrimitiveBrush(canvas.getContext('2d'));

            canvas.addEventListener('mousedown', brush.start.bind(brush));
            canvas.addEventListener('mousemove', brush.move.bind(brush));
            canvas.addEventListener('mouseup', brush.end.bind(brush));

        };

        var drawRow = function (data, idx) {
                
                var bar_width = config.bar_width;
                var plotWidth;
                var rowData = data || [];

                if (config.plot_width !== null) {
                    plotWidth = config.plot_width;
                    bar_width = config.plot_width / rowData.length;
                } else {
                    plotWidth = bar_width * rowData.length;
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

                var colorscale_fn = get_colorscale_fn(data);
                var position;

                var extraPosition = columnOrder.length;

                _.forEach(data, function(val, index, array) {
                    position = (columnOrder.indexOf(index) || extraPosition++) * bar_width;
                    context.fillStyle = colorscale_fn(val);
                    context.fillRect( position, 0, bar_width, config.bar_height );
                }, this);

                initializeBrush(canvas);

            };

            var highlightRowRegion = function() {
                var canvas = d3.select(this).select('canvas').node();
                if (canvas === undefined) { return; }

                var start = highlightRegion[0];
                var width = highlightRegion[1] - start;
                
                var context = canvas.getContext('2d');
                context.fillStyle='none';
                context.strokeStyle='#000000';
                context.strokeWidth='1px';
                context.strokeRect(start * bar_width, 0, width * bar_width, config.bar_height);
            };

            var get_colorscale_fn = function (data) {
                var row_colorscale = (config.colorscale &&  config.colorscale.length > 1) ? config.colorscale : ["yellow", "blue"];
                // identify unique categorical values
                var values = _.uniq(data);
                  //map categorical values to static array of colors...
                var colorscaleFn = d3.scale.ordinal().domain(values).range(row_colorscale);
                return function (val) {
                    return colorscaleFn(values.indexOf(val));
                };
            };

        return {
            // data: [],
            // columns_by_cluster: {},

            draw : function(el, matrix) {
                var self = this;
                if (el !== undefined) {
                        parentEl = d3.select(el);
                } else if (parentEl === undefined) {
                        parentEl = d3.select('body');
                }
                
                if (matrix !== undefined) {
                    data = matrix.map(function(val) {
                        if (val instanceof Array) {
                            return val.map( function(el) {
                                return el;
                            });
                        } else {
                            return [];
                        }
                    });
                }
                var longest = data.reduce(function(memo,row) { return _.max([memo,row.length]); }, 0);
                columnOrder =  columnOrder || _.range(0, longest);

                var rows = parentEl
                        .selectAll('.s-row')
                        .data(data);

                    rows
                        .enter()
                        .append('div')
                        .attr('class','s-row');
                
                rows.each(drawRow);
            },

            redraw : function() {
                this.draw( );
            },

           clusterByRows: function(rows) {
                
                var rowData, values, cast = String;
                if ( sortRows === rows ) { return; }
                
                sortRows = rows;

                var valueOrders = new Array(sortRows.length);
                var columnOrders = new Array(sortRows.length);

                sortRows.forEach(function(row, sortIndex){

                    if ( Boolean(parseInt(row, 10)) && data[row] !== undefined) {
                        rowData = data[row];
                        cast = Number;
                    } else if (typeof(row) === 'string' && data[config.row_labels.indexOf(row)] !== undefined) {
                        rowData = data[config.row_labels.indexOf(row)];
                        cast = String;
                    } else {
                        return;
                    }
                    valueOrders[sortIndex] = _.chain(rowData)
                                        .countBy(function(val) { return val;})
                                        .pairs()
                                        .map(function(arrVal){ return [cast.call(this, arrVal[0]), arrVal[1]]; })
                                        .sortBy(function(arrVal) { return arrVal[1]; })
                                        .map(function(arrVal) { return arrVal[0]; })
                                        .reverse()
                                        .value();
                                        

                    // columnOrders[sortIndex] = _.sortBy(columnOrder, function(colIndex) { return valueOrder.indexOf(rowData[colIndex]); } ).reverse();
                });
                //hierarchical sort!
                if (sortRows.length > 1) {
                columnOrder = _.range(0, columnOrder.length).sort(function(indexA, indexB){
                    for (var i =0; i < sortRows.length; i++) {
                        var valA = valueOrders[i].indexOf(rowData[indexA]),
                            valB = valueOrders[i].indexOf(rowData[indexB]);
                        if ( valA === valB ) { continue; }
                        return valA - valB;
                    }
                    return 0;
                });
                } else {  //shortcut if only one row to sort on.
                    columnOrder = _.sortBy(columnOrder, function(colIndex) { return valueOrders[0].indexOf(rowData[colIndex]); } ).reverse();
                }

                this.redraw();

           },


            plot_width: function () {
                var columnCounts = _.map(config.columns_by_cluster, function (columns) {
                    return columns.length;
                });
                var numberOfColumns = _.reduce(columnCounts, function (memo, num) {
                    return memo + num;
                }, 0);
                // TODO : Determine plot and bar width based on a scale
                return (config.bar_width * numberOfColumns);
            }
        };
    };

    return Stacksvis;
}));