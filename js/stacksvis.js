var Stacksvis = function (el, options) {
    var defaults = {
        vertical_padding: 30,
        horizontal_padding: 30,
        bar_height: 20,
        bar_width: 5,
        column_spacing: 2,
        row_spacing: 10,
        cluster_legend_height: 20,
        cluster_spacing: 10,
        highlight_bar_height: 7,
        row_labels: [],
        selectors: {},
        all_columns: "All Columns"
    };

    return {
        $el: (el),
        options: _.extend(defaults, options),
        rowlabels: [],
        columnlabels: [],
        clusterlabels: [defaults.all_columns],
        clusterproperty: defaults.all_columns,
        data: [],
        columns_by_cluster: {},

        draw: function (data) {
            this.$el.empty();

            var models = data || {};

            if (_.has(models, "rowlabels")) this.rowlabels = models.rowlabels || [];
            if (_.has(models, "columnlabels")) this.columnlabels = models.columnlabels || [];
            if (_.has(models, "clusterlabels")) this.clusterlabels = models.clusterlabels || [];
            if (_.has(models, "data")) this.data = models.data || [];

            this._init_row_scale();
            this._init_cluster();
            this._render_html();
            this._render_row_labels();
            this._render_svg();
        },

        spacing: function (spacers) {
            console.log("spacing(" + JSON.stringify(spacers) + ")");
        },

        _render_html: function () {
            var ulCls = "stacksvis-rowlabels " + this.options.selectors.rowlabels;
            var divCls = "stacksvis-heatmap " + this.options.selectors.heatmap;
            this.$el.html("<ul class='" + ulCls + "'></ul><div class='" + divCls + "'></div>");
        },

        _render_row_labels: function () {
            var labelsContainer = this.$el.find(".stacksvis-rowlabels");
            labelsContainer.empty();
            _.each(this.rowlabels, function (rowLabel) {
                labelsContainer.append("<li>" + rowLabel + "</li>")
            });

            if (_.has(this.options, "bar_height")) {
                labelsContainer.find("li").css({ "line-height": this.options["bar_height"] + "px" });
            }
            if (_.has(this, "row_spacing")) {
                labelsContainer.find("li").css({ "padding-bottom": this.options["row_spacing"] + "px" });
            }
            if (_.has(this, "label_fontsize")) {
                labelsContainer.find("li").css({ "font-size": this.options["label_fontsize"] + "px" });
            }
            if (_.has(this, "label_width")) {
                labelsContainer.css({ "width": this.options["label_width"] + "px" });
            }
            if (_.has(this, "enable_rowlabels")) {
                labelsContainer.css({ "display": this.options["enable_rowlabels"] ? "block" : "none" });
            }

            this.$el.trigger("render-rowlabels");
        },

        _render_svg: function () {
            var visEl = this.$el.find(".stacksvis-heatmap");
            var plotWidth = this._plot_width();
            var plotHeight = this._plot_height();

            this.svg = d3.select(visEl[0])
                .append("svg")
                .attr("width", plotWidth + (2 * this.options.horizontal_padding))
                .attr("height", plotHeight + (2 * this.options.vertical_padding));

            this.data_area = this.svg.append("g")
                .attr("transform", "translate(" + this.options.horizontal_padding + "," + (this.options.vertical_padding + this.options.cluster_legend_height) + ")")
                .attr("width", plotWidth)
                .attr("height", plotHeight);

            var label_items = _.map(this.clusterlabels, function (d) {
                var columns = this.columns_by_cluster[d] || [];
                return { "label": d, "num_samples": this.columns_by_cluster[d].length }
            }, this);

            var _this = this;
            this.cluster_g = this.data_area.selectAll("g.cluster-info")
                .data(label_items)
                .enter()
                .insert("g")
                .attr("class", "cluster-info")
                .attr("width", function (d) {
                    return d["num_samples"];
                });

            this.cluster_g.append("text").attr("y", -5)
                .text(function (d) {
                    return d.label;
                });

            this.cluster_columns = this.cluster_g.selectAll("g.cluster-column")
                .data(function (cluster_info) {
                    return _.map(_this.columns_by_cluster[cluster_info.label], function (sample_label, sample_idx) {
                        return {
                            s: sample_label,
                            scale_get_fn: function () {
                                return _this.cluster_scales[cluster_info.label];
                            },
                            values: _this.data[sample_idx]
                        }
                    })
                }, function (d) {
                    return d.s;
                })
                .enter()
                .append("g")
                .attr("class", "cluster-column");

            var first_cluster = d3.select(this.cluster_g[0][0]);

            this.sample_bars = this.cluster_columns.selectAll("rect.sample")
                .data(function (d) {
                    return d.values;
                });

            this.sample_bars.enter()
                .append("rect")
                .attr("class", "sample")
                .style("fill", this.color_fn)
                .attr("x", 0)
                .attr("width", this.bar_width)
                .attr("height", this.bar_height)
                .append("svg:title")
                .attr("class", "sample-label")
                .text(function (d) {
                    if (d !== undefined && d.label !== undefined) return d.label;
                    return "Not defined";
                });

            this.highlight_markers = this.cluster_columns.selectAll("rect.highlight")
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
                .style("fill", this.highlight_fill)
                .attr("width", this.bar_width)
                .attr("x", 0)
                .attr("height", this.highlight_bar_height)
                .style("stroke-width", 0.0);

//            this._updateVerticalScales();
//            this._updateHorizontalScales();
//            this._updateLabelDimensions();
        },

        _init_cluster: function () {
            var _this = this;
            var unsorted_columns = [];
            var cluster_property = this.clusterproperty || this.options.all_columns;

            if (cluster_property == this.options.all_columns) {
                unsorted_columns = _.map(this.columnlabels, function (column_name, col_idx) {
                    var column = { "name": column_name.trim(), "cluster": this.options.all_columns, "values": [] };
                    _.each(this.rowlabels, function (row_label, row_idx) {
                        var dv = this.data[row_idx][col_idx];
                        if (_.has(dv, "trim")) dv = dv.trim();
                        column.values.push(dv);
                    }, this);
                    return column;
                }, this);
            } else {
                unsorted_columns = _.map(this.columnlabels, function (column_name, col_idx) {
                    var cluster_idx = this.rowlabels.indexOf(cluster_property);
                    var cluster_value = _this.data[cluster_idx][col_idx].trim();
                    if (_.has(cluster_value, "trim")) cluster_value =  cluster_value.trim();

                    var column = { "name": column_name.trim(), "cluster": cluster_value, "values": [cluster_value] };
                    _.each(this.rowlabels, function (row_label, row_idx) {
                        var dv = this.data[row_idx][col_idx];
                        if (_.has(dv, "trim")) dv = dv.trim();
                        column.values.push(dv.trim().toLowerCase());
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

        _init_row_scale: function () {
            var domain = _.map(this.rowlabels, function (row_label, idx) {
                return idx;
            });

            var maxRowHeight = this.rowlabels.length * (this.options["bar_height"] + this.options["row_spacing"]);
            this.row_index_scale = d3.scale.ordinal().domain(domain).rangeRoundBands([0, maxRowHeight]);
        },

        _plot_height: function () {
            return (this.options.bar_height + this.options.row_spacing) * (this.rowlabels.length + 1);
        },

        _plot_width: function () {
            var columnCounts = _.map(this.columns_by_cluster, function (columns) {
                return columns.length;
            });
            var numberOfColumns = _.reduce(columnCounts, function (memo, num) {
                return memo + num;
            }, 0);
            return ((this.options.bar_width + this.options.column_spacing) * numberOfColumns) + (this.options.cluster_spacing * this.clusterlabels.length);
        }
    }
};