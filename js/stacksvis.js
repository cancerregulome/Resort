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

            colorscale: [],
            highlight: {
                bar_height: 7,
                fill: "red"
            }
        };

        options = _.extend(defaults, options);

        var drawRow = function (data, idx) {
                
                var bar_width = options.bar_width;
                var plotWidth;
                var rowData = data || [];

                if (options.plot_width !== null) {
                    plotWidth = options.plot_width;
                    bar_width = options.plot_width / rowData.length;
                } else {
                    plotWidth = bar_width * rowData.length;
                }
                //clustered column order is defined.
                // iterative through each cluster value
                var clusters = _.map(options.columns_by_cluster, function (clusterLabel, clusterValue) {
                    //initialize value
                    var columns = clusterValue || [];
                    return {
                        "cluster_values": _.filter(rowData, function (val, index) {
                            return index === clusterValue;
                        }, this)
                    };
                }, this);

                var visEl = d3.select(this);

                visEl.selectAll("*").remove();

                var canvasSelection = visEl.append('canvas')
                    .attr("width", plotWidth)
                    .attr("height", options.bar_height);

                var canvas = canvasSelection.node();
                var context = canvas.getContext('2d');
                context.fillStyle = '#FFFFFF';
                context.fillRect(0, 0, plotWidth, options.bar_height);
                var currentPos = 0;

                var colorscale_fn = get_colorscale_fn(data);
                
                _.forEach(clusters, function(cluster, index, array) {
                    context.fillStyle = colorscale_fn(cluster.cluster_values[0]);
                    context.fillRect( currentPos, 0, cluster.cluster_values.length * bar_width, options.bar_height );
                    currentPos = currentPos + cluster.cluster_values.length * bar_width;
                }, this);

                // this._highlight_bars(g_column);
            };

            var get_colorscale_fn = function (data) {
                var row_colorscale = (options.colorscale &&  options.colorscale.length > 1) ? options.colorscale : ["yellow", "blue"];
                // identify unique categorical values
                var values = _.uniq(data);
                  //map categorical values to static array of colors...
                var colorscaleFn = d3.scale.ordinal().domain(values).range(row_colorscale);
                return function (val) {
                    return colorscaleFn(values.indexOf(val));
                };
            };

        return {
            data: [],
            columns_by_cluster: {},

            draw : function(el, data) {
                var self = this;
                var parentEl = d3.select(el);

                var rows = parentEl
                .selectAll('.s-row')
                .data(data)
                .enter()
                .append('div')
                .attr('class','s-row');
                
                rows.each(drawRow);
            },

            _highlight_bars: function (g_column) {
                var rect_highlight = g_column.selectAll("rect.highlight")
                    .data(function (d) {
                        return _.compact(_.map(_.values(d), function (cellvalue, index) {
                            if (cellvalue !== undefined && cellvalue.isHighlighted) {
                                return index;
                            }
                        }));
                    })
                    .enter()
                    .append("rect")
                    .attr("class", "highlight")
                    .style("fill", options.highlight.fill)
                    .attr("width", options.bar_width)
                    .attr("x", 0)
                    .attr("height", options.highlight.bar_height);
                g_column.selectAll("rect.highlight").style("fill", options.highlight.fill);
            },

            _plot_width: function () {
                var columnCounts = _.map(options.columns_by_cluster, function (columns) {
                    return columns.length;
                });
                var numberOfColumns = _.reduce(columnCounts, function (memo, num) {
                    return memo + num;
                }, 0);
                // TODO : Determine plot and bar width based on a scale
                return (options.bar_width * numberOfColumns);
            }
        };
    };

    return Stacksvis;
}));