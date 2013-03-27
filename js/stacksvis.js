var Stacksvis = function (el, options) {
    var defaults = {
        vertical_padding: 30,
        horizontal_padding: 30,
        bar_height: 20,
        bar_width: 5,
        cluster_legend_height: 20,
        highlight_bar_height: 7,
        label_width: 100,
        highlight_fill: "red",
        all_columns: "All Columns",
        spacing: {
            column: 2,
            row: 10,
            cluster: 10
        },
        selectors: {}
    };

    return {
        $el: (el),
        options: _.extend(defaults, options),
        dimensions: {
            row: [],
            column: [],
            cluster: [defaults.all_columns, defaults.all_columns]
        },
        clusterproperty: defaults.all_columns,
        data: [],
        columns_by_cluster: {},
        svg_elements: {},

        draw: function (data) {
            this.$el.empty();

            var models = data || {};

            if (_.has(models, "dimensions")) {
                var dimensions = models.dimensions;
                if (_.has(dimensions, "row")) this.dimensions.row = dimensions.row || [];
                if (_.has(dimensions, "column")) this.dimensions.column = dimensions.column || [];
                if (_.has(dimensions, "cluster")) this.dimensions.cluster = dimensions.cluster || [];
            }

            if (_.has(models, "data")) this.data = models.data || [];

            this._init_cluster();
            this._render_html();
            this._render_dimensions();
            this._render_svg();
        },

        spacing: function (optns) {
            if (optns) {
                if (optns.row) {
                    var ygap = this.options.bar_height + optns.row;

                    this.svg_elements.g_column.selectAll("rect.bar")
                        .attr("y", function (d, i) {
                            return i * ygap;
                        });

                    this.$el.find(".stacksvis-row li").css({ "padding-bottom": optns.row });
                }
                if (optns.column) {
                    var xgap = this.options.bar_width + optns.column;

                    this.svg_elements.g_column.selectAll("rect.bar")
                        .attr("x", function (d, i, a) {
                            return a * xgap;
                        });
                }
                if (optns.cluster) {
                    this.svg_elements.svg.selectAll("g.cluster")
                        .attr("transform", function (d, i) {
                            return "translate(" + i * optns.cluster + ",0)";
                        });

                    this.$el.find(".stacksvis-cluster li").css({ "padding-right": optns.cluster });
                }
            }
        },

        _render_html: function () {
            this.$el.append("<div><ul class='stacksvis-row " + this.options.selectors.row + "'></ul></div>");
            this.$el.append("<div><ul class='stacksvis-cluster " + this.options.selectors.cluster + "'></ul></div>");
            this.$el.append("<div><ul class='stacksvis-column " + this.options.selectors.column + "'></ul></div>");
            this.$el.append("<div class='stacksvis-heatmap " + this.options.selectors.heatmap + "'></div>");

            this.$el.css({
                "border": "1px dashed black",
                "height": 600
            });
            this.$el.find(".stacksvis-row").css({
//                "border": "2px solid blue",
                "margin-top": (2 * this.options.cluster_legend_height)
//                "height": 500,
//                "width": this.options["label_width"]
            });
            this.$el.find(".stacksvis-cluster").parent().css({
//                "border": "2px solid red",
                "height": this.options.cluster_legend_height,
                "margin-left": this.options["label_width"]
            });
            this.$el.find(".stacksvis-column").parent().css({
//                "border": "1px solid darkorange",
                "height": this.options.cluster_legend_height,
                "margin-left": this.options["label_width"]
            });
            this.$el.find(".stacksvis-heatmap").css({
//                "border": "1px solid black",
                "height": 500
            });
        },

        _render_dimensions: function () {
            var clusterContainers = this.$el.find(".stacksvis-cluster");
            clusterContainers.empty();
            _.each(this.dimensions.cluster, function (label) {
                clusterContainers.append("<li>" + label + "</li>")
            });

            var columnContainers = this.$el.find(".stacksvis-column");
            columnContainers.empty();
            _.each(this.dimensions.column, function (label) {
                columnContainers.append("<li>" + label + "</li>")
            });

            columnContainers.find("li").css({
                "-webkit-transform": "rotate(-90deg)",
                "-moz-transform": "rotate(-90deg)",
                "-ms-transform": "rotate(-90deg)",
                "-o-transform": "rotate(-90deg)",
                "font-size": 6,
                "width": this.options.bar_width + this.options.spacing.column
            });

            var row_container = this.$el.find(".stacksvis-row");
            row_container.empty();
            _.each(this.dimensions.row, function (rowLabel) {
                row_container.append("<li>" + rowLabel + "</li>")
            });

//            if (_.has(this.options, "bar_height")) {
//                row_container.find("li").css({ "line-height": this.options["bar_height"] });
//            }
            if (_.has(this.options.spacing, "row")) {
                row_container.find("li").css({ "padding-bottom": this.options.spacing.row });
            }
            if (_.has(this, "label_fontsize")) {
                row_container.find("li").css({ "font-size": this.options["label_fontsize"] });
            }
            if (_.has(this, "label_width")) {
                row_container.css({ "width": this.options["label_width"] });
            }
            if (_.has(this, "enable_rowlabels")) {
                row_container.css({ "display": this.options["enable_rowlabels"] ? "block" : "none" });
            }

            this.$el.trigger("render-dimensions");
        },

        _get_colorscale_fn: function (values) {
            var colorscaleFn = d3.scale.ordinal()
                .domain(values).range(d3.range(values.length)
                    .map(d3.scale.linear().domain([0, values.length - 1]).range(["yellow", "green"])
                        .interpolate(d3.interpolateLab)));
            return function (cell) {
                return colorscaleFn(values.indexOf(cell));
            };
        },

        _render_svg: function () {
            var visEl = this.$el.find(".stacksvis-heatmap").empty();
            var plotWidth = this._plot_width();
            var plotHeight = this._plot_height();

            var colorscales = _.map(this.dimensions.row, function (rowlabel, rowidx) {
                return this._get_colorscale_fn(this.data[rowidx]);
            }, this);

            this.svg_elements.svg = d3.select(visEl[0])
                .append("svg")
                .attr("width", plotWidth + (2 * this.options.horizontal_padding))
                .attr("height", plotHeight + (2 * this.options.vertical_padding));

            var xgap = this.options.bar_width + this.options.spacing.column;
            var ygap = this.options.bar_height + this.options.spacing.row;

            var clusters = _.map(this.dimensions.cluster, function (clusterlabel) {
                var columns = this.columns_by_cluster[clusterlabel] || [];
                return {
                    "label": clusterlabel,
                    "width": columns.length * xgap,
                    "values": _.map(columns, function (label, idx) {
                        return {
                            "label": label,
                            "values": this.data[idx]
                        }
                    }, this)
                }
            }, this);

            this.svg_elements.g_cluster = this.svg_elements.svg.selectAll("g.cluster")
                .data(clusters)
                .enter()
                .insert("g")
                .attr("x", function (d, i, a) {
                    return i * xgap;
                })
                .attr("class", "cluster")
                .attr("width", function (d) {
                    return d.width;
                });

            this.svg_elements.g_column = this.svg_elements.g_cluster.selectAll("g.column")
                .data(function (d) {
                    return d.values;
                })
                .enter().append("g").attr("class", "column");

            var _this = this;
            this.svg_elements.rect_bar = this.svg_elements.g_column.selectAll("rect.bar")
                .data(function (d) {
                    return d.values;
                })
                .enter().append("rect").attr("class", "bar")
                .style("fill", function (d, i) {
                    return colorscales[i](d) || "white";
                })
                .attr("x", function (d, i, a) {
                    return a * xgap;
                })
                .attr("y", function (d, i) {
                    return i * ygap;
                })
                .attr("width", this.options.bar_width)
                .attr("height", this.options.bar_height)
                .append("title")
                .text(function (d, i, a) {
                    return _this.dimensions.row[i] + "\n" + _this.dimensions.column[a] + "\n" + d;
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
                .attr("height", this.options.highlight_bar_height)
                .style("stroke-width", 0.0);
        },

        _init_cluster: function () {
            var unsorted_columns = [];
            var cluster_property = this.clusterproperty || this.options.all_columns;

            if (cluster_property == this.options.all_columns) {
                unsorted_columns = _.map(this.dimensions.column, function (column_name, col_idx) {
                    var column = { "name": column_name.trim(), "cluster": this.options.all_columns, "values": [] };
                    _.each(this.dimensions.row, function (row_label, row_idx) {
                        var dv = this.data[row_idx][col_idx];
                        if (_.has(dv, "trim")) dv = dv.trim();
                        column.values.push(dv);
                    }, this);
                    return column;
                }, this);
            } else {
                unsorted_columns = _.map(this.dimensions.column, function (column_name, col_idx) {
                    var cluster_idx = this.dimensions.row.indexOf(cluster_property);
                    var cluster_value = this.data[cluster_idx][col_idx].trim();
                    if (_.has(cluster_value, "trim")) cluster_value = cluster_value.trim();

                    var column = { "name": column_name.trim(), "cluster": cluster_value, "values": [cluster_value] };
                    _.each(this.dimensions.row, function (row_label, row_idx) {
                        var dv = this.data[row_idx][col_idx];
                        if (_.has(dv, "trim")) dv = dv.trim();
                        column.values.push(dv);
                    }, this);
                    return column;
                }, this);
            }

            var sorted_columns = _.sortBy(unsorted_columns, "values");
            var grouped_columns = _.groupBy(sorted_columns, "cluster");

            this.columns_by_cluster = {};
            _.each(grouped_columns, function (values, key) {
                this.columns_by_cluster[key] = _.pluck(values, "name");
            }, this);
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
            return ((this.options.bar_width + this.options.spacing.column) * numberOfColumns) + (this.options.spacing.cluster * this.dimensions.cluster.length);
        }
    }
};