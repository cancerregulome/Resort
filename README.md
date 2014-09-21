Resort
=========

A relaxing vacation for those who want to view sorted, grouped multivariate data.

Resort supports:

* custom color scales
* configurable layouts
* predefined DOM 
* event attachment to row labels

View the example demo in action [here](http://bl.ocks.org/rbkreisberg/raw/51086728d8e737df7afb/).

## Hello World ##

Resort currently requires *d3* and *underscore*.  Resort works with AMD, CommonJS or in a global context.  Just be sure that d3 and underscore are available prior to loading resort.js.  For instance:

```html
    <script type="text/javascript" src="http://d3js.org/d3.v3.js"></script>
    <script type="text/javascript" src="//cdnjs.cloudflare.com/ajax/libs/underscore.js/1.6.0/underscore-min.js"></script>
    <script type="text/javascript" src="js/resort.js"></script>
```

Include/Insert a Target Parent Dom Element
```html
 <div id="vis-panel">
    <div class="vis"></div>
</div>
```

Declare the heatmap instance variable
```javascript
var resort;
```

Create a set of rows within the parent element.  One for each row of data.  Two columns (divs): one for the label, one for the heatmap.
```javascript
 var resortRows = d3
            .select('.vis')
            .selectAll('.data-row')
            .data(rows)
            .enter()
            .append('div').attr('class', 'data-row');
        
resortRows.append('div').attr('class','label');
resortRows.append('div').attr('class','resort-row');
```

Format the data (excluding row labels) as a two dimensional array.  If row labels are in the data, remove them before initializing Resort.
```javascript
var raw_input  = [ 
			[ "Row 1", 1, 2],
			[ "Row 2", 3, 4]
];

var rowlabels = raw_input.map(function(row) { return row[0]; });
var data = raw_input.map(funtion(row) { return row.slice(1); });
```


Insert the row label text into each row's label column

```javascript
  d3.selectAll('.data-row .label')
        .append('a')
        .attr('href','#')
        .on('click', function(val) {
            resort.groupByRow(val);
            return false;
        })
        .html(function(val) { return val; })
    };
```

Initialize Resort and draw.

```javascript
resort = new Resort({
            "row_labels": rowlabels,
            "columns_labels": columnlabels,
            "bar_width": bar_width,
            "bar_height": bar_height,
            "bar_padding": bar_padding,
            "group_padding": group_padding,
            "row_selector": ".resort-row",
            "enable_hover": true
        });

var parentEl = d3.select('.vis').node();

resort.draw(parentEl, heatmapData);
```

Note the "row_selector" option.  The class *resort-row* is the default value.  Be sure to set this selector to the class name assigned to each heatmap column DOM element within each data row DOM element.

## Additional Techniques ##

Click events on row labels
Attach a listener to the row label in whatever fashion you choose.  For instance, during the creation of the row labels
```javascript
  d3.selectAll('.data-row .label')
        .append('a')
        .attr('href','#')
        .on('click', function(val) {
            resort.groupByRow(val);
            return false;
        })
        .html(function(val) { return val; })
    };
```

The method *groupByRow* is called when the row label is clicked.


## API ##

### Glossary ###

**rowIdentifier** is an informal type that can be either the index of a row of the data *or* the corresponding row label in the data.

**colorDefinition** is a valid text or RGB color Definition.  Text ("green"), Hex RGB ( "#00FF00" ).


Configuration object properties
```json
bar_height: integer ( pixels )
bar_width: integer ( pixels ),
bar_padding: integer ( pixels ),
group_padding : integer ( pixels ),
plot_width: integer/null ( pixels ),
row_labels: [row1Label, row2Label, ...],
colorscale: [color1Definition, color2Definition, ...],
colormap : { {dataValue1: value1Color}, {dataValue2: value2Color}, ...},
highlight: {
    bar_height: integer ( pixels),
    fill: colorDefinition
},
row_selector : elementSelector
enable_select : Boolean,
enable_hover : Boolean
```

**constructor**(configurationObject)

Example using a colorbrewer color map, a predefined order of data values
```javascript
var resort = new Resort( {
	 "colormap": {
                "EVEN": colorbrewer['Set3'][12][0],
                "ODD": colorbrewer['Set3'][12][1],
                "4": colorbrewer['Set3'][12][2],
                "5": colorbrewer['Set3'][12][3],
                "6": colorbrewer['Set3'][12][4],
                "7": colorbrewer['Set3'][12][5],
                "8": colorbrewer['Set3'][12][6],
                "9": colorbrewer['Set3'][12][7],
                "10": colorbrewer['Set3'][12][8]
            },
            "value_order": [4, 5, 6, 7, 8, 9, 10, "EVEN", "ODD"],
            "row_labels": rowlabels,
            "column_labels": columnlabels,
            "bar_width": bar_width,
            "bar_height": bar_height,
            "bar_padding": bar_padding,
            "group_padding": group_padding,
            "row_selector": ".resort-row",
            "enable_hover": true
});
```
The constructor returns an instance of Resort.  The following functions are instance methods.

**resort.setOptions**(configurationObject)

**resort.draw**(parentDOMElement, aataMatrix)

_parentDOMElement_: The DOM Element in the current document that contains the row elements to be rendered on.

_dataMatrix_: Two dimensional data array.  Each array contains only data to be plotted

**resort.groupByRow**(rowIdentifier)

**resort.groupByRows**([rowIdentifier1, rowIdentifier2, ...])