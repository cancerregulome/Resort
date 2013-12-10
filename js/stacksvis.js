var Stacksvis = function (el, options) {
    var defaults = {
        vertical_padding: 30,
        horizontal_padding: 30,
        bar_height: 20,
        bar_width: 5,
        cluster_legend_height: 20,
        highlight_bar_height: 7,
        highlight_fill: "red",
        all_columns: "All Columns",
        spacing: {
            column: 0,
            row: 0,
            cluster: 0
        },
        colorscales: {},
        selectors: {}
    };

    return {
        $el: (el),
        options: _.extend(defaults, options),
        dimensions: {
            row: [],
            column: []
        },
        data: [],
        columns_by_cluster: {},
        svg_elements: {},

        draw: function (inputs) {
            this.$el.empty();

            inputs = inputs || {};

            if (_.has(inputs, "dimensions")) _.extend(this.dimensions, inputs.dimensions);
            if (_.has(inputs, "data")) this.data = inputs.data || [];

            this._cluster_data();
            this._render_svg();
        },

        // private methods
        _cluster_data: function () {
            var unsorted_columns = _.map(this.dimensions.column, function (column_name, col_idx) {
                var column = { "name": column_name.trim(), "cluster": this.options.all_columns, "values": [] };
                _.each(this.dimensions.row, function (row_label) {
                    column.values.push(this.data[column_name][row_label]);
                }, this);
                return column;
            }, this);

            var sorted_columns = _.sortBy(unsorted_columns, "values");
            var grouped_columns = _.groupBy(sorted_columns, "cluster");

            this.columns_by_cluster = {};
            _.each(grouped_columns, function (values, key) {
                this.columns_by_cluster[key] = _.pluck(values, "name");
            }, this);
        },

        _render_svg: function () {
//            var plotWidth = this._plot_width();
            var plotHeight = this._plot_height();
            var ygap = this.options.bar_height + this.options.spacing.row;
            var xgap = this.options.bar_width + this.options.spacing.column;

            _.each(this.options.row_labels, function (row_label, row_index) {
                var row_selector = this.options.row_selectors[row_label];
                var visEl = $(row_selector).empty();

                var svg = d3.select(visEl[0]).append("svg")
                    .attr("width", 300)
//                    .attr("width", plotWidth)
                    .attr("height", plotHeight);

                var clusters = _.map(_.keys(this.columns_by_cluster), function (clusterlabel) {
                    var columns = this.columns_by_cluster[clusterlabel] || [];
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

                g_column.selectAll("rect.bar")
                    .data(function (d) {
                        return [d[row_label]];
                    })
                    .enter()
                    .append("rect")
                    .attr("class", "bar")
                    .append("title")
                    .text(function (d) {
                        return d.label;
                    });

//                var rect_highlight = g_column.selectAll("rect.highlight")
//                    .data(function (d) {
//                        var mutated = [];
//                        _.each(_.values(d), function (cellvalue, index) {
//                            if (cellvalue !== undefined && cellvalue.isMutated) {
//                                mutated.push(index);
//                            }
//                        });
//                        return mutated;
//                    })
//                    .enter()
//                    .append("rect")
//                    .attr("class", "highlight")
//                    .style("fill", this.options.highlight_fill)
//                    .attr("width", this.options.bar_width)
//                    .attr("x", 0)
//                    .attr("height", this.options.highlight_bar_height);
//                g_column.selectAll("rect.highlight").style("fill", this.options.highlight_fill);

                // spacing
                g_column.selectAll("rect.bar")
                    .attr("y", function (d, i) {
                        return i * ygap;
                    })
                    .attr("x", function (d, i, a) {
                        return a * xgap;
                    })
                    .attr("width", this.options.bar_width)
                    .attr("height", this.options.bar_height);

                g_column.selectAll("rect.bar").style("fill", function (d, i) {
                    return d.colorscale;
                });
            }, this);
        },

        _plot_height: function () {
            return (this.options.bar_height + this.options.spacing.row);
        },

        _plot_width: function () {
            var columnCounts = _.map(this.columns_by_cluster, function (columns) {
                return columns.length;
            });
            var numberOfColumns = _.reduce(columnCounts, function (memo, num) {
                return memo + num;
            }, 0);
            return ((this.options.bar_width + this.options.spacing.column) * numberOfColumns) + (this.options.spacing.cluster * _.keys(this.columns_by_cluster).length);
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