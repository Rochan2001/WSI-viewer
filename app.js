//let params = geo.util.pixelCoordinateParams('#map',31744, 37632,254,254);
//const map = geo.map(params.map);
//
//params.layer.url = `gmapdir/{z}/{y}/{x}.jpg`;
//
//const layer = map.createLayer('osm', params.layer);
//
//map.geoOn(geo.event.mousemove, function (evt) {
//    $('#info').text('x: ' + evt.geo.x.toFixed(6) + ', y: ' + evt.geo.y.toFixed(6));
//  });

/* globals $, geo, utils */

var annotationDebug = {};

// Run after the DOM loads
$(function () {
  "use strict";

  function getQuery() {
    var query = document.location.search
      .replace(/(^\?)/, "")
      .split("&")
      .map(
        function (n) {
          n = n.split("=");
          if (n[0]) {
            this[decodeURIComponent(n[0].replace(/\+/g, "%20"))] =
              decodeURIComponent(n[1].replace(/\+/g, "%20"));
          }
          return this;
        }.bind({})
      )[0];
    return query;
  }

  function setQuery(params, updateHistory) {
    $.each(params, function (key, value) {
      if (value === undefined) {
        delete params[key];
      }
    });
    var newurl =
      window.location.protocol +
      "//" +
      window.location.host +
      window.location.pathname +
      "?" +
      $.param(params);
    if (updateHistory) {
      window.history.pushState(params, "", newurl);
    } else {
      window.history.replaceState(params, "", newurl);
    }
  }

  var layer, fromButtonSelect, fromGeojsonUpdate;

  // get the query parameters and set controls appropriately
  var query = getQuery();
  $("#clickmode").val(query.clickmode || "edit");
  $("#keepadding").prop("checked", query.keepadding === "true");
  $("#showLabels").prop("checked", query.labels !== "false");
  if (query.lastannotation) {
    $(".annotationtype button").removeClass("lastused");
    $(".annotationtype button#" + query.lastannotation).addClass("lastused");
  }
  // You can set the initial annotations via a query parameter.  If the query
  // parameter 'save=true' is specified, the query will be updated with the
  // geojson.  This can become too long for some browsers.
  var initialGeoJSON = query.geojson;

  // respond to changes in our controls
  $("#controls").on("change", change_controls);
  $("#geojson[type=textarea]").on("input propertychange", change_geojson);
  $("#controls").on("click", "a", select_control);
  $(".annotationtype button").on("click", select_annotation);
  $("#editdialog").on("submit", edit_update);

  $("#controls").toggleClass("no-controls", query.controls === "false");

  // start the map near Fresno unless the query parameters say to do otherwise
    let params = geo.util.pixelCoordinateParams('#map',31744, 37632,254,254);
    const map = geo.map(params.map);
   // allow some query parameters to specify what map we will show
    params.layer.url = `gmapdir/{z}/{y}/{x}.jpg`;

    const layerOsm = map.createLayer('osm', params.layer);

    map.geoOn(geo.event.mousemove, function (evt) {
        $('#info').text('x: ' + evt.geo.x.toFixed(6) + ', y: ' + evt.geo.y.toFixed(6));
      });
  // create an annotation layer
  layer = map.createLayer("annotation", {
    renderer: query.renderer
      ? query.renderer === "html"
        ? null
        : query.renderer
      : undefined,
    annotations: query.renderer ? undefined : geo.listAnnotations(),
    showLabels: query.labels !== "false",
    clickToEdit: !query.clickmode || query.clickmode === "edit",
  });
  // bind to the mouse click and annotation mode events
  layer.geoOn(geo.event.mouseclick, mouseClickToStart);
  layer.geoOn(geo.event.annotation.mode, handleModeChange);
  layer.geoOn(geo.event.annotation.add, handleAnnotationChange);
  layer.geoOn(geo.event.annotation.update, handleAnnotationChange);
  layer.geoOn(geo.event.annotation.remove, handleAnnotationChange);
  layer.geoOn(geo.event.annotation.state, handleAnnotationChange);


  // pick which button is initially highlighted based on query parameters.
  if (query.lastused || query.active) {
    if (query.active) {
      layer.mode(query.active);
    } else {
      $(".annotationtype button").removeClass("lastused active");
      $(".annotationtype button#" + query.lastused).addClass("lastused");
    }
  }

  // if we have geojson as a query parameter, populate our annotations
  if (initialGeoJSON) {
    layer.geojson(initialGeoJSON, true);
  }

  // expose some internal parameters so you can examine them from the console
  annotationDebug.layer = layer;
  annotationDebug.query = query;

  /**
   * When the mouse is clicked, switch to adding an annotation if appropriate.
   *
   * @param {geo.event} evt geojs event.
   */
  function mouseClickToStart(evt) {
    if (evt.handled || query.clickmode !== "add") {
      return;
    }
    if (evt.buttonsDown.left) {
      if (
        $(".annotationtype button.lastused").hasClass("active") &&
        query.keepadding === "true"
      ) {
        return;
      }
      select_button(".annotationtype button.lastused");
    } else if (evt.buttonsDown.right) {
      select_button(
        ".annotationtype button#" +
          $(".annotationtype button.lastused").attr("next")
      );
    }
  }

  /**
   * Handle changes to our controls.
   *
   * @param evt jquery evt that triggered this call.
   */
  function change_controls(evt) {
    var ctl = $(evt.target),
      param = ctl.attr("param-name"),
      value = ctl.val();
    if (ctl.is('[type="checkbox"]')) {
      value = ctl.is(":checked") ? "true" : "false";
    }
    if (value === "" && ctl.attr("placeholder")) {
      value = ctl.attr("placeholder");
    }
    if (!param || value === query[param]) {
      return;
    }
    switch (param) {
      case "labels":
        layer.options("showLabels", "" + value !== "false");
        layer.draw();
        break;
      case "clickmode":
        layer.options("clickToEdit", value === "edit");
        layer.draw();
        break;
    }
    query[param] = value;
    if (
      value === "" ||
      (ctl.attr("placeholder") && value === ctl.attr("placeholder"))
    ) {
      delete query[param];
    }
    // update our query parameters, os when you reload the page it is in the
    // same state
    setQuery(query);
  }

  /**
   * Handle changes to the geojson.
   *
   * @param evt jquery evt that triggered this call.
   */
  function change_geojson(evt) {
    var ctl = $(evt.target),
      value = ctl.val();
    // when we update the geojson from the textarea control, raise a flag so we
    // (a) ignore bad geojson, and (b) don't replace the user's geojson with
    // the auto-generated geojson
    fromGeojsonUpdate = true;
    var result = layer.geojson(value, "update");
    if (query.save && result !== undefined) {
      var geojson = layer.geojson();
      query.geojson = geojson ? JSON.stringify(geojson) : undefined;
      setQuery(query);
    }
    fromGeojsonUpdate = false;
  }

  /**
   * Handle selecting an annotation button.
   *
   * @param evt jquery evt that triggered this call.
   */
  function select_annotation(evt) {
    select_button(evt.target);
  }

  /**
   * Select an annotation button by jquery selector.
   *
   * @param {object} ctl a jquery selector or element.
   */
  function select_button(ctl) {
    ctl = $(ctl);
    var wasactive = ctl.hasClass("active"),
      id = ctl.attr("id");
    fromButtonSelect = true;
    layer.mode(wasactive ? null : id);
    fromButtonSelect = false;
  }

  /**
   * When the annotation mode changes, update the controls to reflect it.
   *
   * @param {geo.event} evt a geojs mode change event.
   */
  function handleModeChange(evt) {
    // highlight the current buttons based on the current mode
    var mode = layer.mode();
    $(".annotationtype button").removeClass("active");
    if (mode) {
      $(".annotationtype button").removeClass("lastused active");
      $(".annotationtype button#" + mode).addClass("lastused active");
    }
    $("#instructions").attr(
      "annotation",
      $(".annotationtype button.active").attr("id") || "none"
    );
    query.active = $(".annotationtype button.active").attr("id") || undefined;
    query.lastused = query.active
      ? undefined
      : $(".annotationtype button.lastused").attr("id");
    setQuery(query);
    // if we are in keep-adding mode, and the mode changed to null, and that
    // wasn't caused by clicking the button, reenable the annotation mode.
    if (!mode && !fromButtonSelect && query.keepadding === "true") {
      layer.mode($(".annotationtype button.lastused").attr("id"));
    }
  }

  /**
   * When an annotation is created or removed, update our list of annotations.
   *
   * @param {geo.event} evt a geojs mode change event.
   */
  function handleAnnotationChange(evt) {
    var annotations = layer.annotations();
    var ids = annotations.map(function (annotation) {
      return annotation.id();
    });
    var present = [];
    $("#annotationlist .entry").each(function () {
      var entry = $(this);
      if (entry.attr("id") === "sample") {
        return;
      }
      var id = entry.attr("annotation-id");
      // Remove deleted annotations
      if ($.inArray(id, ids) < 0) {
        entry.remove();
        return;
      }
      present.push(id);
      // update existing elements
      entry.find(".entry-name").text(layer.annotationById(id).name());
    });
    // Add if new and fully created
    $.each(ids, function (idx, id) {
      if ($.inArray(id, present) >= 0) {
        return;
      }
      var annotation = layer.annotationById(id);
      if (annotation.state() === geo.annotation.state.create) {
        return;
      }
      var entry = $("#annotationlist .entry#sample").clone();
      entry.attr({ id: "", "annotation-id": id });
      entry.find(".entry-name").text(annotation.name());
      $("#annotationlist").append(entry);
    });
    $("#annotationheader").css(
      "display",
      $("#annotationlist .entry").length <= 1 ? "none" : "block"
    );
    if (!fromGeojsonUpdate) {
      // update the geojson textarea
      var geojson = layer.geojson();
      $("#geojson").val(geojson ? JSON.stringify(geojson, undefined, 2) : "");
      if (query.save) {
        query.geojson = geojson ? JSON.stringify(geojson) : undefined;
        setQuery(query);
      }
    }
  }

  /**
   * Handle selecting a control.
   *
   * @param evt jquery evt that triggered this call.
   */
  function select_control(evt) {
    var mode,
      ctl = $(evt.target),
      action = ctl.attr("action"),
      id = ctl.closest(".entry").attr("annotation-id"),
      annotation = layer.annotationById(id);
    switch (action) {
      case "adjust":
        layer.mode(layer.modes.edit, annotation);
        layer.draw();
        break;
      case "edit":
        show_edit_dialog(id);
        break;
      case "remove":
        layer.removeAnnotation(annotation);
        break;
      case "remove-all":
        fromButtonSelect = true;
        mode = layer.mode();
        layer.mode(null);
        layer.removeAllAnnotations();
        layer.mode(mode);
        fromButtonSelect = false;
        break;
    }
  }

  /**
   * Show the edit dialog for a particular annotation.
   *
   * @param {number} id the annotation id to edit.
   */
  function show_edit_dialog(id) {
    var annotation = layer.annotationById(id),
      type = annotation.type(),
      typeMatch = new RegExp("(^| )(" + type + "|all)( |$)"),
      opt = annotation.options(),
      dlg = $("#editdialog");

    $("#edit-validation-error", dlg).text("");
    dlg.attr("annotation-id", id);
    dlg.attr("annotation-type", type);
    $('[option="name"]', dlg).val(annotation.name());
    $('[option="label"]', dlg).val(annotation.label(undefined, true));
    $('[option="description"]', dlg).val(annotation.description());
    // populate each control with the current value of the annotation
    $(".form-group[annotation-types]").each(function () {
      var ctl = $(this),
        key = $("[option]", ctl).attr("option"),
        format = $("[option]", ctl).attr("format"),
        value;
      if (!ctl.attr("annotation-types").match(typeMatch)) {
        // if a property doesn't exist for the current annotation's type, hide
        // the control
        ctl.hide();
        return;
      }
      ctl.show();
      switch ($("[option]", ctl).attr("optiontype")) {
        case "option":
          value = opt[key];
          break;
        case "label":
          value = (opt.labelStyle || {})[key];
          break;
        default:
          value = opt.style[key];
          break;
      }
      switch (format) {
        case "angle":
          if (value !== undefined && value !== null && value !== "") {
            value = "" + +((+value * 180.0) / Math.PI).toFixed(4) + " deg";
          }
          break;
        case "color":
          // always show colors as hex values
          value = geo.util.convertColorToHex(
            value || { r: 0, g: 0, b: 0 },
            "needed"
          );
          break;
        case "coordinate2":
          if (value !== undefined && value !== null && value !== "") {
            value = "" + value.x + ", " + value.y;
          }
      }
      if (
        (value === undefined || value === "" || value === null) &&
        $("[option]", ctl).is("select")
      ) {
        value = $("[option] option", ctl).eq(0).val();
      }
      $("[option]", ctl).val(value === undefined ? "" : "" + value);
    });
    dlg.one("shown.bs.modal", function () {
      $('[option="name"]', dlg).focus();
    });
    dlg.modal();
  }

  /**
   * Update an annotation from values in the edit dialog.
   *
   * @param evt jquery evt that triggered this call.
   */
  function edit_update(evt) {
    evt.preventDefault();
    var dlg = $("#editdialog"),
      id = dlg.attr("annotation-id"),
      annotation = layer.annotationById(id),
      opt = annotation.options(),
      type = annotation.type(),
      typeMatch = new RegExp("(^| )(" + type + "|all)( |$)"),
      newopt = { style: {}, labelStyle: {} },
      error;

    // validate form values
    $(".form-group[annotation-types]").each(function () {
      var ctl = $(this),
        key = $("[option]", ctl).attr("option"),
        format = $("[option]", ctl).attr("format"),
        value,
        oldvalue;
      if (!ctl.attr("annotation-types").match(typeMatch)) {
        return;
      }
      value = $("[option]", ctl).val();
      switch (format) {
        case "angle":
          if (/^\s*[.0-9eE]+\s*$/.exec(value)) {
            value += "deg";
          }
          break;
      }
      switch (key) {
        case "textScaled":
          if (["true", "on", "yes"].indexOf(value.trim().toLowerCase()) >= 0) {
            value = map.zoom();
          }
          break;
      }
      value = layer.validateAttribute(value, format);
      switch ($("[option]", ctl).attr("optiontype")) {
        case "option":
          oldvalue = opt[key];
          break;
        case "label":
          oldvalue = (opt.labelStyle || {})[key];
          break;
        default:
          oldvalue = opt.style[key];
          break;
      }
      if (value === oldvalue || (oldvalue === undefined && value === "")) {
        // don't change anything
      } else if (value === undefined) {
        error = $("label", ctl).text() + " is not a valid value";
      } else {
        switch ($("[option]", ctl).attr("optiontype")) {
          case "option":
            newopt[key] = value;
            break;
          case "label":
            newopt.labelStyle[key] = value;
            break;
          default:
            newopt.style[key] = value;
            break;
        }
      }
    });
    if (error) {
      $("#edit-validation-error", dlg).text(error);
      return;
    }
    annotation.name($('[option="name"]', dlg).val());
    annotation.label($('[option="label"]', dlg).val() || null);
    annotation.description($('[option="description"]', dlg).val() || "");
    annotation.options(newopt).draw();

    dlg.modal("hide");
    // refresh the annotation list
    handleAnnotationChange();
  }
});
