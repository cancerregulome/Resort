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
        factory($, _, d3);
    }
}(this, function ($, _, d3) {

    var Stacksvis = function (el, options) {
        var defaults = {
            bar_height: 20,
            bar_width: 0.5,
            colorscales: {},
            row_selectors: {},
            highlight: {
                bar_height: 7,
                fill: "red"
            }
        };

        return {
            $el: (el),
            options: _.extend(defaults, options),
            data: [],
            columns_by_cluster: {},

            draw: function (inputs) {
                inputs = inputs || {};
                if (_.has(inputs, "data")) this.data = inputs.data || [];

                var plotWidth = this._plot_width();
                var bar_width = this.options.bar_width;
                if (plotWidth <= 300) {
                    plotWidth = 300;
                    bar_width = 4;
                }

                _.each(this.options.row_labels, function (row_label) {
                    var row_selector = this.options.row_selectors[row_label];
                    var visEl = $(row_selector).empty();

                    var svg = d3.select(visEl[0]).append("svg")
                        .attr("width", plotWidth)
                        .attr("height", this.options.bar_height);

                    var clusters = _.map(_.keys(this.options.columns_by_cluster), function (clusterlabel) {
                        var columns = this.options.columns_by_cluster[clusterlabel] || [];
                        return {
                            "cluster_values": _.compact(_.map(columns, function (column) {
                                return this.data[column]
                            }, this))
                        }
                    }, this);

                    var g_cluster = svg.selectAll("g.cluster").data(clusters).enter().insert("g").attr("class", "cluster");

                    var g_column = g_cluster.selectAll("g.column")
                        .data(function (d) {
                            return d.cluster_values;
                        })
                        .enter().append("g").attr("class", "column");

                    var i = 0;
                    g_column.selectAll("rect.bar")
                        .data(function (d) {
                            return [d[row_label]];
                        })
                        .enter()
                        .append("rect")
                        .attr("class", "bar")
                        .append("title")
                        .text(function (d) {
                            return d.label + "\n" + i++;
                        });

                    g_column.selectAll("rect.bar")
                        .attr("x", function (d, i, a) {
                            return a * bar_width;
                        })
                        .attr("width", bar_width)
                        .attr("height", this.options.bar_height);

                    g_column.selectAll("rect.bar").style("fill", function (d, i) {
                        return d.colorscale;
                    });

                    this._highlight_bars(g_column);
                }, this);
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
                    .style("fill", this.options.highlight.fill)
                    .attr("width", this.options.bar_width)
                    .attr("x", 0)
                    .attr("height", this.options.highlight.bar_height);
                g_column.selectAll("rect.highlight").style("fill", this.options.highlight.fill);
            },

            _plot_width: function () {
                var columnCounts = _.map(this.options.columns_by_cluster, function (columns) {
                    return columns.length;
                });
                var numberOfColumns = _.reduce(columnCounts, function (memo, num) {
                    return memo + num;
                }, 0);
                // TODO : Determine plot and bar width based on a scale
                return (this.options.bar_width * numberOfColumns);
            },

            _get_colorscale_fn: function (rowlabel, rowidx) {
                var row_colorscale = (this.options.colorscales[rowlabel]) ? this.options.colorscales[rowlabel] : ["yellow", "green"];
                var values = _.map(this.data[rowidx], function (item) {
                    return item.value;
                });
                var colorrangeMap = d3.scale.linear().domain([0, values.length - 1]).range(row_colorscale);
                var colorrangeFn = d3.range(values.length).map(colorrangeMap);
                var colorscaleFn = d3.scale.ordinal().domain(values).range(colorrangeFn);
                return function (cell) {
                    return colorscaleFn(values.indexOf(cell.value));
                };
            }
        }
    };

    return Stacksvis;
}));