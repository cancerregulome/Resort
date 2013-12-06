var Stacksvis = function (el, options) {
    var defaults = {
        vertical_padding: 30,
        horizontal_padding: 30,
        bar_height: 20,
        bar_width: 5,
        cluster_legend_height: 20,
        highlight_bar_height: 7,
        label_width: 100,
        label_fontsize: 12,
        highlight_fill: "red",
        all_columns: "All Columns",
        spacing: {
            column: 2,
            row: 10,
            cluster: 10
        },
        colorscales: {},
        selectors: {}
    };

    return {
        $el: (el),
        options: _.extend(defaults, options),
        dimensions: {
            row: [],
            column: [],
            clusterBy: undefined
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
            this._render_html();
            this._render_dimensions();
            this._render_svg();
            this._refresh_spacing();
            this._refresh_fills();
        },

        spacing: function (optns) {
            if (optns) {
                _.extend(this.options.spacing, optns);
                this._refresh_spacing();
            }
        },

        // private methods
        _cluster_data: function () {
            var unsorted_columns = _.map(this.dimensions.column, function (column_name, col_idx) {
                var column_cluster = this.options.all_columns;
                if (this.dimensions.clusterBy) {
                    var clusterIdx = this.dimensions.row.indexOf(this.dimensions.clusterBy);
                    column_cluster = this.data[clusterIdx][col_idx];
                }

                var column = { "name": column_name.trim(), "cluster": column_cluster, "values": [] };

                _.each(_.without(this.dimensions.row, this.dimensions.clusterBy), function (row_label, row_idx) {
                    column.values.push(this.data[row_idx][col_idx]);
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

        _render_html: function () {
            this.$el.append("<div><ul class='stacksvis-row " + this.options.selectors.row + "'></ul></div>");
//            this.$el.append("<div><ul class='stacksvis-cluster " + this.options.selectors.cluster + "'></ul></div>");
//            this.$el.append("<div><ul class='stacksvis-column " + this.options.selectors.column + "'></ul></div>");
            this.$el.append("<div class='stacksvis-heatmap " + this.options.selectors.heatmap + "'></div>");
        },

        _render_dimensions: function () {
            var _append_labels = function (container, labels) {
                $(container).empty();
                _.each(labels, function (label) {
                    $(container).append("<li>" + label + "</li>")
                });
            };
//            _append_labels(this.$el.find(".stacksvis-cluster"), _.keys(this.columns_by_cluster));
//            _append_labels(this.$el.find(".stacksvis-column"), this.dimensions.column);
            _append_labels(this.$el.find(".stacksvis-row"), _.without(this.dimensions.row, this.dimensions.clusterBy));
            this.$el.trigger("render-dimensions");
        },

        _render_svg: function () {
            var visEl = this.$el.find(".stacksvis-heatmap").empty();
            var plotWidth = this._plot_width();
            var plotHeight = this._plot_height();

            this.svg_elements.svg = d3.select(visEl[0])
                .append("svg")
                .attr("width", plotWidth + (2 * this.options.horizontal_padding))
                .attr("height", plotHeight + (2 * this.options.vertical_padding));

            var rowlabels = this.dimensions.row;
            var clusterIdx = (this.dimensions.clusterBy) ? this.dimensions.row.indexOf(this.dimensions.clusterBy) : -1;

            var clusters = _.map(_.keys(this.columns_by_cluster), function (clusterlabel) {
                var columns = this.columns_by_cluster[clusterlabel] || [];
                return {
                    "label": clusterlabel,
                    "values": _.map(columns, function (label, idx) {
                        return {
                            "label": label,
                            "values": _.compact(_.map(this.data, function (row, rowidx) {
                                if (rowidx == clusterIdx) return null;

                                return {
                                    "label": label + "\n" + rowlabels[rowidx] + "\n" + row[idx],
                                    "values": row[idx]
                                };
                            }))
                        }
                    }, this)
                }
            }, this);

            this.svg_elements.g_cluster = this.svg_elements.svg.selectAll("g.cluster")
                .data(clusters).enter().insert("g").attr("class", "cluster");

            this.svg_elements.g_column = this.svg_elements.g_cluster.selectAll("g.column")
                .data(function (d) {
                    return d.values;
                })
                .enter().append("g").attr("class", "column");

            this.svg_elements.rect_bar = this.svg_elements.g_column.selectAll("rect.bar")
                .data(function (d) {
                    return d.values;
                })
                .enter()
                .append("rect")
                .attr("class", "bar")
                .append("title")
                .text(function (d) {
                    return d.label;
                });

            this.svg_elements.rect_highlight = this.svg_elements.g_column.selectAll("rect.highlight")
                .data(function (d) {
                    var mutated = [];
                    _.each(d.values, function (cellvalue, index) {
                        if (cellvalue !== undefined && cellvalue.isMutated) {
                            mutated.push(index);
                        }
                    });
                    return mutated;
                })
                .enter()
                .append("rect")
                .attr("class", "highlight")
                .style("fill", this.options.highlight_fill)
                .attr("width", this.options.bar_width)
                .attr("x", 0)
                .attr("height", this.options.highlight_bar_height);
        },

        _plot_height: function () {
            return (this.options.bar_height + this.options.spacing.row) * (this.dimensions.row.length + 1);
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

        _refresh_spacing: function () {
            var ygap = this.options.bar_height + this.options.spacing.row;
            var xgap = this.options.bar_width + this.options.spacing.column;
            var cluster_spacing = this.options.spacing.cluster;

            // SVG
            this.svg_elements.g_column.selectAll("rect.bar")
                .attr("y", function (d, i) {
                    return i * ygap;
                })
                .attr("x", function (d, i, a) {
                    return a * xgap;
                })
                .attr("width", this.options.bar_width)
                .attr("height", this.options.bar_height);


            this.svg_elements.svg.selectAll("g.cluster")
                .attr("transform", function (d, i) {
                    return "translate(" + i * cluster_spacing + ",0)";
                });

            // ROW
            this.$el.find(".stacksvis-row").css({
                "margin-top": 0, //  (2 * this.options.cluster_legend_height),
                "width": this.options["label_width"],
                "display": this.options.disableRowLabels ? "none" : "block"
            });

            if (!this.options.disableRowLabels) {
                this.$el.find(".stacksvis-row").css({ "width": this.options["label_width"] });
                this.$el.find(".stacksvis-row li").css({
                    "font-size": this.options["label_fontsize"],
                    "padding-bottom": this.options.spacing.row
                });
//                this.$el.find(".stacksvis-row li").css({ "line-height": this.options.spacing.row });
            }

            // COLUMNS
            this.$el.find(".stacksvis-column").parent().css({
                "height": this.options.cluster_legend_height,
                "margin-left": this.options["label_width"]
            });
            this.$el.find(".stacksvis-column li").css({ "width": this.options.bar_width + this.options.spacing.column });

            // CLUSTERS
            this.$el.find(".stacksvis-cluster").parent().css({
                "height": this.options.cluster_legend_height,
                "margin-left": this.options["label_width"]
            });
            this.$el.find(".stacksvis-cluster li").css({ "padding-right": cluster_spacing });

            // MUTATIONS
            this.svg_elements.g_column.selectAll("rect.highlight")
                .attr("width", this.options.bar_width)
                .attr("height", this.options.highlight_bar_height);
        },

        _refresh_fills: function () {
            var colorscaleFns = _.map(this.dimensions.row, this._get_colorscale_fn, this);
            this.svg_elements.g_column.selectAll("rect.bar").style("fill", function (d, i) {
                return colorscaleFns[i](d.values) || "white";
            });

            this.svg_elements.g_column.selectAll("rect.highlight").style("fill", this.options.highlight_fill);

        },

        _get_colorscale_fn: function (rowlabel, rowidx) {
            var row_colorscale = (this.options.colorscales[rowlabel]) ? this.options.colorscales[rowlabel] : ["yellow", "green"];
            var values = this.data[rowidx];
            var colorrangeMap = d3.scale.linear().domain([0, values.length - 1]).range(row_colorscale);
            var colorrangeFn = d3.range(values.length).map(colorrangeMap);
            var colorscaleFn = d3.scale.ordinal().domain(values).range(colorrangeFn);
            return function (cell) {
                return colorscaleFn(values.indexOf(cell));
            };
        }
    }
};