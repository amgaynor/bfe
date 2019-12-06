bfe.define('src/bfe', ['require', 'exports', 'src/bfestore', 'src/bfelogging', 'src/bfeapi', 'src/lib/aceconfig'], function (require, exports) {
  var editorconfig = {};
  var bfestore = require('src/bfestore');
  var bfelog = require('src/bfelogging');
  var bfeapi = require('src/bfeapi');
  var bfeusertemplates = require('src/bfeusertemplates');
  var bfeliterallang = require('src/bfeliterallang');

  // var store = new rdfstore.Store();
  var profiles = [];
  var resourceTemplates = [];
  var addFields = [];
  var addedProperties = [];
  // var startingPoints = [];
  // var formTemplates = [];
  // var lookups = [];
  
  // holds the last two weeks of data
  var twoWeeksOfData = [];
  // holds the rest of it
  var twoWeeksPlusOfData = [];
  var browseloaded = false;

  var dataTable = null;
  
  var tabIndices = 1;

  var loadtemplates = [];
  var loadtemplatesANDlookupsCount = 0;
  var loadtemplatesANDlookupsCounter = 0;

  // var lookupstore = [];
  // var lookupcache = [];

  var entryfunc = null;
  var editordiv;

  // var csrf;

  var forms = [];


  var lookups = {
    'http://id.loc.gov/authorities/names': {
      'name': 'LCNAF',
      'load': require('src/lookups/lcnames')
    },
    'http://id.loc.gov/authorities/subjects': {
      'name': 'LCSH',
      'load': require('src/lookups/lcsubjects')
    },
    'http://id.loc.gov/authorities/genreForms': {
      'name': 'LCGFT',
      'load': require('src/lookups/lcgenreforms')
    },
    'http://id.loc.gov/resources/works': {
      'name': 'LC-Works',
      'load': require('src/lookups/lcworks')
    },
    'http://id.loc.gov/resources/instances': {
      'name': 'LC-Instances',
      'load': require('src/lookups/lcinstances')
    },
    'http://id.loc.gov/vocabulary/organizations': {
      'name': 'Organizations',
      'load': require('src/lookups/lcorganizations')
    },
    'http://id.loc.gov/vocabulary/relators': {
      'name': 'Relators',
      'load': require('src/lookups/relators')
    },
    'http://rdaregistry.info/termList/FormatNoteMus': {
      'name': 'RDA-Format-Musical-Notation',
      'load': require('src/lookups/rdaformatnotemus')
    },
    'http://rdaregistry.info/termList/RDAMediaType': {
      'name': 'RDA-Media-Type',
      'load': require('src/lookups/rdamediatype')
    },
    'http://rdaregistry.info/termList/ModeIssue': {
      'name': 'RDA-Mode-Issue',
      'load': require('src/lookups/rdamodeissue')
    },
    'http://rdaregistry.info/termList/RDACarrierType': {
      'name': 'RDA-Carrier-Type',
      'load': require('src/lookups/rdacarriertype')
    },
    'http://rdaregistry.info/termList/RDAContentType': {
      'name': 'RDA-Content-Type',
      'load': require('src/lookups/rdacontenttype')
    },
    'http://rdaregistry.info/termList/frequency': {
      'name': 'RDA-Frequency',
      'load': require('src/lookups/rdafrequency')
    },
    'http://www.rdaregistry.info/termList/AspectRatio': {
      'name': 'RDA-Aspect-Ratio',
      'load': require('src/lookups/rdaaspectration')
    },
    'http://www.rdaregistry.info/termList/RDAGeneration': {
      'name': 'RDA-Generation',
      'load': require('src/lookups/rdageneration')
    }
  };

  /*
  The following two bits of code come from the Ace Editor code base.
  Included here to make 'building' work correctly.  See:
  https://github.com/ajaxorg/ace/blob/master/lib/ace/ace.js
  */
  exports.aceconfig = require('src/lib/aceconfig');
  /**
     * Provides access to require in packed noconflict mode
     * @param {String} moduleName
     * @returns {Object}
     *
     **/
  exports.require = require;

  exports.setConfig = function (config) {
    editorconfig = config;

    // Set up logging
    bfelog.init(editorconfig);
    
    // pass the config to the usertemplates so it can disable templates if localstorage is not available
    bfeusertemplates.setConfig(editorconfig);
    
    bfeliterallang.loadData(editorconfig);

    //setup callbacks
    editorconfig.api.forEach(function (apiName) {
      editorconfig[apiName] = {};
      editorconfig[apiName].callback = bfeapi[apiName];
    });

    /**
     * Profiles are expected to be in the form provided by Verso:
     * A JSON Array of objects with a "json" property that contains the profile proper
     **/
    for (var i = 0; i < config.profiles.length; i++) {
      var file = config.profiles[i];
      bfelog.addMsg(new Error(), 'DEBUG', 'Attempting to load profile: ' + file);
      $.ajax({
        type: 'GET',
        dataType: 'json',
        url: file,
        error: function (XMLHttpRequest, textStatus, errorThrown) {
          bfelog.addMsg(new Error(), 'ERROR', 'FAILED to load profile: ' + file);
          bfelog.addMsg(new Error(), 'ERROR', 'Request status: ' + textStatus + '; Error msg: ' + errorThrown);
        },
        complete: function (jqXHR, textStatus) {
          if (textStatus == 'success') {
            var data = JSON.parse(jqXHR.responseText);
            $('#bfeditor-loader').width($('#bfeditor-loader').width() + 5 + '%');

            if (data.length > 0) {
              for (var j = 0; j < data.length; j++) {
                profiles.push(data[j].json);
                for (var rt = 0; rt < data[j].json.Profile.resourceTemplates.length; rt++) {
                  resourceTemplates.push(data[j].json.Profile.resourceTemplates[rt]);
                }
                bfelog.addMsg(new Error(), 'INFO', 'Loaded profile: ' + data[j].name);
              }
                if (editorconfig.load) {
                    editorconfig.load.callback(config, bfestore, cbLoadTemplates);
                }
              
            } else {
              bfelog.addMsg(new Error(), 'ERROR', 'No profiles loaded from ' + this.url + ' (empty result set)');
            }
          }
        }
      });
    }

    if (config.lookups !== undefined) {
      loadtemplatesANDlookupsCount = loadtemplatesANDlookupsCount + Object.keys(config.lookups).length;
      config.lookups.foreach(function (lu) {
        bfelog.addMsg(new Error(), 'INFO', 'Loading lookup: ' + lu.load);
        require([lu.load], function (r) {
          setLookup(r);
        });
      });
    }
    if (editorconfig.baseURI === undefined) {
      editorconfig.baseURI = window.location.protocol + '//' + window.location.host + '/';
    }
    bfelog.addMsg(new Error(), 'INFO', 'baseURI is ' + editorconfig.baseURI);

  };
  
  exports.findTitle = function(data){
    var retval;
    var altretval;
    var titleString = 'http://id.loc.gov/ontologies/bibframe/title'
    var mainTitleString = 'http://id.loc.gov/ontologies/bibframe/mainTitle'

    if (_.some(data, titleString)) {
      var text = _.find(data, titleString)[titleString];
      if (text !== undefined) {
        _.each(text, function (el) {
          if (el['@id'] !== undefined) {
            var id = el['@id'];
            var title = _.find(data, {
              '@id': id
            });
            if (!_.isEmpty(title) && title['@type'].indexOf("http://id.loc.gov/ontologies/bibframe/Title") >= 0) {
              if (_.has(title, mainTitleString)) 
                { retval = title[mainTitleString][0]['@value']; 
              } else if (_.has(title, 'http://www.w3.org/2000/01/rdf-schema#label')) { 
                retval = title['http://www.w3.org/2000/01/rdf-schema#label'][0]['@value']; 
              }
            } else {
              if (_.has(title, mainTitleString)) 
                  altretval = title[mainTitleString][0]['@value'];
            }
          }
        });
      }
    } else if (_.isEmpty(retval) && _.some(data, 'http://www.loc.gov/mads/rdf/v1#authoritativeLabel')) {
      altretval = _.find(data, 'http://www.loc.gov/mads/rdf/v1#authoritativeLabel')['http://www.loc.gov/mads/rdf/v1#authoritativeLabel'][0]['@value'];
      if (altretval === undefined) { altretval = _.find(data, 'http://www.loc.gov/mads/rdf/v1#authoritativeLabel')['http://www.w3.org/2000/01/rdf-schema#label'][0]['@value']; }
    }

    if (_.isEmpty(retval)){
      if(!_.isEmpty(altretval))
        retval = altretval;
      else 
        retval = 'No Title';
    }
    
    return retval;
  }

  exports.findLccn = function(data){
    var lccnval = 'N/A';
    var lccns = _.filter(data, function (el) {
      if (!_.isEmpty(el['@type'])) {
        if (el['@type'][0].match('^(http|https)://id.loc.gov/ontologies/bibframe/Lccn')) {
          if (_.has(el, ['http://www.w3.org/1999/02/22-rdf-syntax-ns#value'])) {
            if (!_.isEmpty(el['http://www.w3.org/1999/02/22-rdf-syntax-ns#value'][0]['@value'])) { return el['http://www.w3.org/1999/02/22-rdf-syntax-ns#value'][0]['@value']; }
          }
        }
      }
    });
    if (!_.isEmpty(lccns)) {
      if (lccns.length === 1) {
        lccnval = lccns[0]['http://www.w3.org/1999/02/22-rdf-syntax-ns#value'][0]['@value'];
      } else {
        for (var i = 0; i < lccns.length; i++) {
          if (!lccns[i]['http://www.w3.org/1999/02/22-rdf-syntax-ns#value'][0]['@value'].startsWith('n')){
            if (!_.some(lccns[i]['http://id.loc.gov/ontologies/bibframe/status'], {'@id': 'http://id.loc.gov/vocabulary/mstatus/cancinv'}))
              lccnval = lccns[i]['http://www.w3.org/1999/02/22-rdf-syntax-ns#value'][0]['@value']; 
          }
        }
      }
    }
    return lccnval;
  }

  exports.findContribution = function(data){
    var altretval;
    var contributionval;

    var contributionString = 'http://id.loc.gov/ontologies/bibframe/contribution'
    if (_.some(data, contributionString)) {
      var works = _.where(data,contributionString)
      $(function(){
      _.each(works, function(work){
        var contributions = work[contributionString]
        _.each(contributions, function (el) {
          if (el['@id'] !== undefined) {
            var id = el['@id'];
            var contribution = _.find(data, {
              '@id': id
            });
            if (!_.isEmpty(contribution) && !_.isEmpty(contribution['@type'])){
              if(contribution['@type'].indexOf("http://id.loc.gov/ontologies/bflc/PrimaryContribution") >= 0) {
                if(!_.isEmpty(contribution["http://id.loc.gov/ontologies/bibframe/agent"])){
                  var agent = contribution["http://id.loc.gov/ontologies/bibframe/agent"][0]["@id"]
                  if(!_.isEmpty(agent)){
                    if(_.some(data, {"@id": agent}))
                      if(!_.isEmpty( _.find(data, {"@id": agent})["http://www.w3.org/2000/01/rdf-schema#label"])) {
                        contributionval = _.find(data, {"@id": agent})["http://www.w3.org/2000/01/rdf-schema#label"][0]["@value"];
                        return contributionval;
                      }
                  }
                }
              }
            }
          }
        });
      });
      });
    } else if (_.isEmpty(contributionval) && _.some(data, 'http://www.loc.gov/mads/rdf/v1#authoritativeLabel')) {
      altretval = _.find(data, 'http://www.loc.gov/mads/rdf/v1#authoritativeLabel')['http://www.loc.gov/mads/rdf/v1#authoritativeLabel'][0]['@value'];
      if (altretval === undefined) { altretval = _.find(data, 'http://www.loc.gov/mads/rdf/v1#authoritativeLabel')['http://www.w3.org/2000/01/rdf-schema#label'][0]['@value']; }
    }

    if (_.isEmpty(contributionval)){
      if(!_.isEmpty(altretval))
      contributionval = altretval;
      else 
      contributionval = '';
    }
    return contributionval;
  }

  exports.findCatalogerId = function (data){
    var text = '';
    var mahttp = _.findKey(data, 'http://id.loc.gov/ontologies/bflc/metadataAssigner');
    var mahttps = _.findKey(data, 'https://id.loc.gov/ontologies/bflc/metadataAssigner');
    var cihttp = _.findKey(data, 'http://id.loc.gov/ontologies/bflc/catalogerId');
    var cihttps = _.findKey(data, 'https://id.loc.gov/ontologies/bflc/catalogerId');
    if (mahttps) {
      text = _.pluck(data[mahttps]['https://id.loc.gov/ontologies/bflc/metadataAssigner'], '@value')[0];
    } else if (mahttp) {
      text = _.pluck(data[mahttp]['http://id.loc.gov/ontologies/bflc/metadataAssigner'], '@value')[0];
    } else if (cihttps) {
      text = _.pluck(data[cihttps]['https://id.loc.gov/ontologies/bflc/catalogerId'], '@value')[0];
    } else if (cihttp) {
      text = _.pluck(data[cihttp]['http://id.loc.gov/ontologies/bflc/catalogerId'], '@value')[0];
    }
    return text;
  }

  exports.loadBrowseData = function($browsediv){
    
    var loadData = function(){
      if (browseloaded){
        return true;
      }

      browseloaded = true;
      $.get( config.url + '/verso/api/bfs', function( data ) {
        $('#table_id td').html('<h4><span class="glyphicon glyphicon-refresh glyphicon-refresh-animate"></span><span>&nbsp;&nbsp;Processing Data</span></h4>');
        
        var twoWeeksAgo = new Date().getTime()/1000 - (14 * 24 * 60 * 60);
        twoWeeksOfData = [];
        twoWeeksPlusOfData = [];
        
        data.forEach(function(d){
          d.title = bfe.findTitle(d.rdf);
          d.lccn = bfe.findLccn(d.rdf);
          d.contribution = bfe.findContribution(d.rdf);
          d.catalogerid = bfe.findCatalogerId(d.rdf);

          if (new Date(d.modified).getTime()/1000 > twoWeeksAgo){
            twoWeeksOfData.push(d);
          }else{
            twoWeeksPlusOfData.push(d);
          }         
        });
        twoWeeksOfData.forEach(function(d){
          dataTable.row.add(d);
        });
        dataTable.draw(false);
        
        var $addDataStatusDiv = $("<div>").text("Only data from the last two weeks is displayed: ").attr('id','two-week-plus-div').addClass('pull-left').css({'padding-right':'20px','line-height':'26px'});
        var $addLastTwoWeeksDataButton = $("<button>").text("Last Two Weeks").addClass('btn btn-basic btn-xs');
        var $addTwoWeekPlusDataButton = $("<button>").text("All Descriptions").addClass('btn btn-basic btn-xs');
        var $addUnpostedDataButton = $("<button>").text("Unposted Only").addClass('btn btn-basic btn-xs');

        var lastTwoWeeksClick = function(){
          dataTable.clear().draw();
          $('#table_id td').html('<h4><span class="glyphicon glyphicon-refresh glyphicon-refresh-animate"></span><span>&nbsp;&nbsp;Processing Data</span></h4>');
          $addDataStatusDiv.text("Loading...");
          window.setTimeout(function(){
            twoWeeksOfData.forEach(function(d){
              dataTable.row.add(d);
            });
            dataTable.draw(false);
            $addDataStatusDiv.text("Only data from the last two weeks is displayed:");
            $addDataStatusDiv.append($addUnpostedDataButton); 
            $addUnpostedDataButton.click(unpostedClick); 
            $addDataStatusDiv.append($("<span>").css({'margin':'0 .2em'}));
            $addDataStatusDiv.append($addTwoWeekPlusDataButton)
            $addTwoWeekPlusDataButton.click(lastTwoWeeksPlusClick);
          },500)
        }

        var lastTwoWeeksPlusClick = function(){
          $addDataStatusDiv.text("Loading...");
          window.setTimeout(function(){
            twoWeeksPlusOfData.forEach(function(d){
              dataTable.row.add(d);
            });
            dataTable.draw(false);
            $addDataStatusDiv.text('All descriptions');
            $addLastTwoWeeksDataButton.off('click');
            $addLastTwoWeeksDataButton.click(lastTwoWeeksClick);
            $addDataStatusDiv.append($addLastTwoWeeksDataButton);
          },500)
        }

        var unpostedClick = function(){
          $addDataStatusDiv.text('Loading ...');
          dataTable.clear().draw();
          $('#table_id td').html('<h4><span class="glyphicon glyphicon-refresh glyphicon-refresh-animate"></span><span>&nbsp;&nbsp;Processing Data</span></h4>');
          window.setTimeout(function(){
            twoWeeksOfData.concat(twoWeeksPlusOfData).forEach(function(d){
              //if(_.isEmpty(d.status) || d.status != 'success')
              if(d.status === 'published')
                dataTable.row.add(d);
            });
            dataTable.draw(false);
            $addDataStatusDiv.text("Only unposted displayed:");
            $addLastTwoWeeksDataButton.off('click');
            $addLastTwoWeeksDataButton.click(lastTwoWeeksClick);
            $addDataStatusDiv.append($addLastTwoWeeksDataButton); 
          },500)
        }

        ///verso/api/bfs?filter[where][status][nlike]=success
        
        $addUnpostedDataButton.click(unpostedClick); 
        $addTwoWeekPlusDataButton.click(lastTwoWeeksPlusClick);
        $addLastTwoWeeksDataButton.click(lastTwoWeeksClick);
        $addDataStatusDiv.append($addUnpostedDataButton); 
        $addDataStatusDiv.append($("<span>").css({'margin':'0 .2em'}));
        $addDataStatusDiv.append($addTwoWeekPlusDataButton);          
        $("#table_id_filter").append($addDataStatusDiv);
      
      });
  
    }

      /* eslint-disable no-unused-vars */
    if (!$.fn.dataTable.isDataTable('#table_id')) {
      var $datatable = $('<table id="table_id" class="display" style="table-layout: fixed"><thead><tr><th>id</th><th>primary contribution</th><th>title</th><th>LCCN</th><th>Cataloger Id</th><th>modified</th><th>edit</th></tr></thead></table>');
      $(function () {
        dataTable = $('#table_id').DataTable({
          'initComplete': function (settings, json) {
            if (window.location.hash !== '') {
              $('#table_id').DataTable().search(window.location.hash.split('#')[1]).draw();
            }

            var urlParams = new URLSearchParams(window.location.search)
            if (urlParams.has('action')) {
              var action = urlParams.get('action');
              var $actiontab = $('a[href="#' + action + '"]')
              $actiontab.tab('show');
              var url = urlParams.get('url');
              $('#bfeditor-' + action + 'uriInput').val(url)
            }
          },
          'processing': true,
          'paging': true,
          // 'ajax': {
            // 'url': config.url + '/verso/api/bfs?filter[limit]=1',
            // 'dataSrc': '',
            // 'headers': {
              // 'Access-Control-Allow-Origin': '*',
              // // 'Content-Type': 'application/json',
              // //'Accept': 'application/json',
              // 'Access-Control-Allow-Methods': 'DELETE, HEAD, GET, OPTIONS, POST, PUT',
              // 'Access-Control-Allow-Headers': 'Content-Type, Content-Range, Content-Disposition, Content-Description',
              // 'Access-Control-Max-Age': '1728000'
            // }
          // },
          "order": [[5, "desc"]],
          // id
          'columns': [
            //{
            //  'data': 'id'
            //},
            // name
            {
              'data': 'name',
              'width': '85px',
              'className': 'column-identifier', 
              'render': function (data, type, full, meta) {
                try {
                  var retval = mintResource(data);

                  if (retval === 'eundefined') {
                    retval = data;
                  }
                } catch (e) {
                  retval = data;
                }

                return retval.substring(0,8);
              }
            },
            //contribution
            {
              'data': 'rdf',
              'className': 'column-contribution',
              'width': '15%',
              'render': function (data, type, full, meta) {
                
                if(full.contribution == undefined){
                  full.contribution = bfe.findContribution(data);
                }
                return full.contribution;
              }
            },
            // title
            {
              'data': 'rdf',
              'className': 'column-title',
              'render': function (data, type, full, meta) {
                var retval;
                var altretval;

                var titleString = 'http://id.loc.gov/ontologies/bibframe/title'
                var mainTitleString = 'http://id.loc.gov/ontologies/bibframe/mainTitle'
                if (full.title == undefined){
                  full.title = bfe.findTitle(data);
                } 
                return full.title;
              }
            },
            // lccn
            {
              'data': 'rdf',
              'width': '85px',
              'className': 'column-identifier', 
              'render': function (data, type, full, meta) {
                var text = 'N/A';
                if (full.lccn == undefined){
                  full.lccn = bfe.findLccn(data).trim().replace(/\s+/g,'');
                }
                text = full.lccn;
                var ldsanchor = text.trim();

                // console.log(full.id);
                if (full.status === 'published' || full.status === 'success') {
                  if(!_.isEmpty(config.basedbURI)){
                    if(_.isEmpty(full.objid) || text !== 'N/A'){
                      full.objid  = 'loc.natlib.instances.e' + text.trim() + '0001';
                      if (text.trim().startsWith('n')) {
                        full.objid = 'loc.natlib.works.' + text.trim().replace(/\s+/g, '');
                      }
                    }
                    ldsanchor = '<a href="' + config.basedbURI + '/' + full.objid + '">' + text + '</a>';
                  } 

                  var table = new $.fn.dataTable.Api(meta.settings);
                  var cell = table.cell(meta.row, meta.col);
                  cell.node().innerHTML = ldsanchor;
                  if (full.status === 'success') {
                    $(cell.node()).css('background-color', 'lightgreen');
                  } else {
                    if (new Date(new Date(full.modified).getTime() + 60000) > new Date()) {
                      $(cell.node()).css('background-color', 'yellow');
                    } else {
                      $(cell.node()).css('background-color', 'lightcoral');
                    }
                  }
                }
                return text;
              }
            },
            //cataloger id
            {
              'data': 'rdf',
              'width': '85px',
              'className': 'column-identifier', 
              'render': function (data, type, full, meta) {
                
                if(full.catalogerid == undefined){
                  full.catalogerid = bfe.findCatalogerId(data);
                }
                return full.catalogerid.length > 60 ? full.catalogerid.substr(0, 58) + '...' : full.catalogerid;
              }
            },
            //modified
            {
              'data': 'modified',
              'className': 'column-modified',
              'width': '130px',
              'render': function (data, type, row) {
                if (type === 'display') {
                  return moment(data).format("M-DD-YYYY h:mm a");
                } else {
                  return parseInt(moment(data).format("YYYYMMDDHHmm"));
                }
              }
            },
            //edit
            {
              'data': 'url',
              'className': 'column-identifier',
              'width': '85px',
              'searchable': false,
              'filterable': false,
              'sortable': false,
              'render': function (td, cellData, rowData, row) {
                //             return '<a href="'+data+'">edit</a>';

                return '<div class="btn-group" id="retrieve-btn"><button id="bfeditor-retrieve' + rowData.id + '" type="button" class="btn btn-default"><span class="glyphicon glyphicon-pencil"></span></button> \
                               <button id="bfeditor-delete' + rowData.id + '"type="button" class="btn btn-danger" data-toggle="modal" data-target="#bfeditor-deleteConfirm' + rowData.id + '"><span class="glyphicon glyphicon-trash"></span></button> \
                               </div>';
              },
              'createdCell': function (td, cellData, rowData, row, col) {
                if (rowData.status === 'success' || rowData.status === 'published') { $(td).find('#bfeditor-delete' + rowData.id).attr('disabled', 'disabled'); }

                var useguid = shortUUID(guid());
                var loadtemplate = {};
                var tempstore = [];
                var spoints;
                //bfestore.store = [];
                //bfestore.loadtemplates = [];

                // default
                // var spoints = editorconfig.startingPoints[0].menuItems[0];
                if (rowData.profile !== 'lc:RT:bf2:Load:Work' && rowData.profile !== 'lc:RT:bf2:IBC:Instance') {
                  var menuIndex = _.findIndex(_(editorconfig.startingPoints).chain().find({
                    menuItems: [{
                      useResourceTemplates: [rowData.profile]
                    }]
                  }).value().menuItems, {
                      useResourceTemplates: [rowData.profile]
                    });
                  spoints = _(editorconfig.startingPoints).chain().find({
                    menuItems: [{
                      useResourceTemplates: [rowData.profile]
                    }]
                  }).value().menuItems[menuIndex];
                } else if (rowData.profile === 'lc:RT:bf2:Load:Work') {
                  spoints = {
                    label: 'Loaded Work',
                    type: ['http://id.loc.gov/ontologies/bibframe/Work'],
                    useResourceTemplates: ['lc:RT:bf2:Load:Work']
                  };
                } else if (rowData.profile === 'lc:RT:bf2:IBC:Instance') {
                  spoints = {
                    label: 'IBC',
                    type: ['http://id.loc.gov/ontologies/bibframe/Instance'],
                    useResourceTemplates: ['lc:RT:bf2:IBC:Instance']
                  };
                }

                var temptemplates = [];
                spoints.useResourceTemplates.forEach(function (l) {
                  var useguid = shortUUID(guid());
                  var loadtemplate = {};
                  loadtemplate.templateGUID = rowData.name;
                  loadtemplate.resourceTemplateID = l;
                  loadtemplate.embedType = 'page';
                  loadtemplate.data = [];
                  temptemplates.push(loadtemplate);
                });

                $(td).find('#bfeditor-retrieve' + rowData.id).click(function () {
                  if (editorconfig.retrieve !== undefined) {
                    // loadtemplates = temptemplates;
                    bfestore.loadtemplates = temptemplates;
                    // editorconfig.retrieve.callback(cellData,bfestore, bfelog, cbLoadTemplates);
                    bfestore.store = [];
                    bfestore.state = 'edit';
                    tempstore = bfestore.jsonld2store(rowData.rdf);
                    bfestore.name = rowData.name;
                    bfestore.created = rowData.created;
                    bfestore.url = rowData.url;
                    bfestore.profile = rowData.profile;
                    var parent = _.find(profiles, function (post) {
                      if (_.some(post.Profile.resourceTemplates, { id: bfestore.profile }))
                      { return post; }
                    });

                    if (!_.isEmpty(rowData.addedProperties))
                      addedProperties = rowData.addedproperties;

                    $('#profileLabel').text(parent.Profile.title + ' ' + _.last(bfestore.profile.split(':')));

                    bfe.exitButtons(editorconfig);
                    
                    cbLoadTemplates();
                    window.location.hash = mintResource(rowData.name).substring(0,8);
                  } else {
                    // retrieve disabled
                    addedProperties = [];
                  }
                });

                $(td).append($('<div class="modal fade" id="bfeditor-deleteConfirm' + rowData.id + '" role="dialog"><div class="modal-dialog modal-sm"><div class="modal-content"> \
                              <div class="modal-body"><h4>Delete?</h4></div>\
                              <div class="modal-footer"><button type="button" class="btn btn-default" id="bfeditor-modalCancel" data-dismiss="modal">Cancel</button> \
                              <button type="button" id="bfeditor-deleteConfirmButton' + rowData.id + '" class="btn btn-danger btn-ok" data-dismiss="modal">Delete</button></div></div></div></div></div>'));

                $(td).find('#bfeditor-deleteConfirmButton' + rowData.id).click(function () {
                  if (editorconfig.deleteId !== undefined) {
                    editorconfig.deleteId.callback(rowData.id, bfelog);
                    //var table = $('#table_id').DataTable();
                    // table.row($(this).parents('tr')).remove().draw();
                    bfestore.store = [];
                    // table.ajax.reload();
                  } else {
                    // delete disabled
                    $('#bfeditor-formdiv').empty();
                    bfestore.store = [];
                    exports.loadBrowseData()
                    var $messagediv = $('<div>', { id: 'bfeditor-messagediv', class: 'alert alert-info' });
                    $messagediv.append('<span class="str"><h3>Delete disabled</h3></span>');
                    $messagediv.insertBefore('.nav-tabs');
                    $('#bfeditor-previewPanel').remove();
                    $('[href=\\#browse]').tab('show');
                  }
                });

                $(td).find('#bfeditor-deleteConfirm' + rowData.id).on('hidden.bs.modal', function () {
                  var table = $('#table_id').DataTable();
                  bfestore.store = [];
                  // table.ajax.reload();
                  exports.loadBrowseData();
                });
              }
            }
          ]
        });
        
        // the datatable is initialized add a status message
        $('#table_id td').html('<h4><span class="glyphicon glyphicon-refresh glyphicon-refresh-animate"></span><span>&nbsp;&nbsp;Loading Data</span></h4>');
        loadData();
        browseloaded = false;
      });

      $browsediv.append($datatable);
    }else{
      // the table already exists, clear it out
      dataTable.clear();
      dataTable.draw(false);  
      $('#table_id td').html('<h4><span class="glyphicon glyphicon-refresh glyphicon-refresh-animate"></span><span>&nbsp;&nbsp;Loading Data</span></h4>');
      
      $("#two-week-plus-div").remove();
      loadData();
      
    }
    /* eslint-enable no-unused-vars */
  
  }
  
  exports.exitButtons = function (editorconfig){

    //clear form
    $('[href=\\#create]').tab('show');
    $('#bfeditor-formdiv').show();
    $('#cloneButtonGroup').remove();
    $('#exitButtonGroup').remove();
    $('#bfeditor-previewPanel').remove();
    $('.alert').remove();
        
    //$('#bfeditor-formdiv').empty();
   
    var $exitButtonGroup = $('<div class="btn-group" id="exitButtonGroup"> \
                      <button id="bfeditor-exitcancel" type="button" class="btn btn-default">Cancel</button> \
                  </div>');

    if (editorconfig.save !== undefined) {
      $exitButtonGroup.append('<button id="bfeditor-exitsave" type="button" class="btn btn-primary">Save</button>');
    }

    if (editorconfig.publish !== undefined) {
      $exitButtonGroup.append('<button id="bfeditor-exitpublish" type="button" class="btn btn-danger">Post</button>');
    }

    $exitButtonGroup.append('<button id="bfeditor-preview" type="button" class="btn btn-warning">Preview</button>');

    $('#bfeditor-menudiv').append($exitButtonGroup);
  }

  exports.lcapplication = function (config, id) {
    this.enteredfunc = "lcapplication";
    this.setConfig(config);
    editordiv = document.getElementById(id);
    var $containerdiv = $('<div class="container-fluid"><h2>Bibframe Editor Workspace</h2></div>');
    var $tabuldiv = $('<div class="tabs"></div>');
    var $tabul = $('<ul class="nav nav-tabs"></ul>');
    $tabul.append('<li class="active"><a data-toggle="tab" id="browsetab" href="#browse">Browse</a></li>');
    $tabul.append('<li><a data-toggle="tab" id="createtab" href="#create">Editor</a></li>');
    $tabul.append('<li><a data-toggle="tab" id="loadworktab" href="#loadwork">Load Work</a></li>');
    $tabul.append('<li><a data-toggle="tab" id="loadibctab" href="#loadibc">Load IBC</a></li>');
    if(editorconfig.enableLoadMarc) {
      $tabul.append('<li><a data-toggle="tab" id="loadmarctab" href="#loadmarc">Load MARC</a></li>');
    }
    if(!_.isEmpty(editorconfig.basedbURI)){
      $tabul.append('<ul class="nav navbar-nav navbar-right"><li class="divider"></li> \
        <a href="' + editorconfig.basedbURI + '">» Search BIBFRAME database</a> </ul>')
    }
    $tabuldiv.append($tabul);
    $containerdiv.append($tabuldiv);

    var $tabcontentdiv = $('<div class="tab-content"></div>');
    var $browsediv = $('<div id="browse" class="tab-pane fade in active"><br></div>');
    var $creatediv = $('<div id="create" class="tab-pane fade"><br></div>');
    var $loadworkdiv = $('<div id="loadwork" class="tab-pane fade"><br></div>');
    var $loadibcdiv = $('<div id="loadibc" class="tab-pane fade"><br></div>');
    var $loadmarcdiv = $('<div id="loadmarc" class="tab-pane fade"><br></div>');
    
    exports.loadBrowseData($browsediv);

    var $loadworkform = $('<div class="container"> \
              <form role="form" method="get"> \
              <div class="form-group"> \
              <label for="url">URL for Bibframe JSON Work</label> \
              <input id="bfeditor-loadworkuriInput" class="form-control" placeholder="Enter URL for Bibframe" type="text" name="url" id="url"> \
              <div id="bfeditor-loadwork-dropdown" class="dropdown"><select id="bfeditor-loadwork-dropdownMenu" type="select" class="form-control">Select Profile</select> \
              </div></div> \
              <button id="bfeditor-loadworkuri" type="button" class="btn btn-primary" disabled=disabled>Submit URL</button> \
              </form></div>')

    var $loadibcform = $('<div class="container"> \
              <form role="form" method="get"> \
              <div class="form-group"> \
              <label for="url">URL for Bibframe JSON</label> \
              <input id="bfeditor-loadibcuriInput" class="form-control" placeholder="Enter URL for Bibframe" type="text" name="url" id="url"> \
              <div id="bfeditor-loadibc-dropdown" class="dropdown"><select id="bfeditor-loadibc-dropdownMenu" type="select" class="form-control">Select Profile</select> \
              </div></div> \
              <button id="bfeditor-loadibcuri" type="button" class="btn btn-primary" disabled=disabled>Submit URL</button> \
              </form></div>');

    // Can this be moved out of there somehow?  It's repeated in fulleditor too.
    editorconfig.setStartingPoints.callback(config, function (config) {
        var getProfileOptions = 
           function (jqObject, elementType) {
            for (var h = 0; h < editorconfig.startingPoints.length; h++) {
              var sp = editorconfig.startingPoints[h];
              var label = sp.menuGroup
              for (var i = 0; i < sp.menuItems.length; i++) {
                var $option = $('<option>', {
                  class: 'dropdown-item',
                  value: 'sp-' + h + '_' + i
                });
                if (sp.menuItems[i].type[0] === elementType) {
                  $option.html(label);
                  jqObject.append($option);
                }
              }
            }
          }
          $(function(){
            $('.dropdown-submenu>a').unbind('click').click(function(e){
              var $openmenu = $('#createresourcesubmenuul.open');
              $openmenu.hide();
              $openmenu.removeClass('open');
              var $dropdown = $(this).next('ul');
              $dropdown.addClass('open');
              $dropdown.toggle();
              e.stopPropagation();
              e.preventDefault();
            });
          });

      getProfileOptions($loadworkform.find('#bfeditor-loadwork-dropdownMenu'), "http://id.loc.gov/ontologies/bibframe/Work");
      getProfileOptions($loadmarcdiv.find('#bfeditor-loadmarc-dropdownMenu'), "http://id.loc.gov/ontologies/bibframe/Work");
      getProfileOptions($loadibcform.find('#bfeditor-loadibc-dropdownMenu'), "http://id.loc.gov/ontologies/bibframe/Instance");
    });

    $loadworkdiv.append($loadworkform);

    $loadworkdiv.find('#bfeditor-loadworkuri').click(function () {
      // var loadtemplates = [];

      // var spoints = { label: 'Loaded Work',
      //   type: ['http://id.loc.gov/ontologies/bibframe/Work'],
      //   useResourceTemplates: ['profile:bf2:Monograph:Work']
      // };

      var spid = $(this.parentElement).find('#bfeditor-loadwork-dropdownMenu').val();
      var label = $(this.parentElement).find('#bfeditor-loadwork-dropdownMenu option:selected').text();
      $('#profileLabel').text(label + ":Work");

      var spnums = spid.replace('sp-', '').split('_');

      var spoints = editorconfig.startingPoints[spnums[0]].menuItems[spnums[1]];

      bfestore.store = [];
      bfestore.name = guid();
      bfestore.created = new Date().toUTCString();
      bfestore.url = config.url + '/verso/api/bfs?filter=%7B%22where%22%3A%20%7B%22name%22%3A%20%22' + bfestore.name + '%22%7D%7D';
      bfestore.state = 'loaduri';
      bfestore.profile = spoints.useResourceTemplates[0];

      var temptemplates = [];
      spoints.useResourceTemplates.forEach(function (l) {
        var useguid = guid();
        var loadtemplate = {};
        loadtemplate.templateGUID = shortUUID(useguid);
        loadtemplate.resourceTemplateID = l;
        loadtemplate.embedType = 'page';
        loadtemplate.data = [];
        temptemplates.push(loadtemplate);
      });

      if (editorconfig.retrieve !== undefined) {
        try {
          bfestore.loadtemplates = temptemplates;
          var url = $(this.parentElement).find('#bfeditor-loadworkuriInput').val();
          editorconfig.retrieve.callback(url, bfestore, bfestore.loadtemplates, bfelog, function (result) {
            if (result instanceof Error){
              var $messagediv = $('<div>', { id: 'bfeditor-messagediv', class: 'alert alert-danger', role: 'alert' });
              $messagediv.append('<strong>'+result.message+'</strong>');
              $messagediv.insertBefore('.tabs');
            } else {
              bfestore.cleanJSONLD('update work');

              bfestore.loadtemplates.data = bfestore.store;

              // weird bnode prob
              _.each(bfestore.store, function (el) {
                if (el.o.startsWith('_:_:')) { el.o = '_:' + el.o.split('_:')[2]; }
              });

              cbLoadTemplates();
            }
          });
        } catch (e) {
          $(this.parentElement).find('#bfeditor-loadworkuriInput').val('An error occured: ' + e.message);
        }
      } else {
        // retrieve disabled
        $('#bfeditor-formdiv').empty();
        bfestore.store = [];
        // $('#table_id').DataTable().ajax.reload();
        exports.loadBrowseData();
        var $messagediv = $('<div>', { id: 'bfeditor-messagediv', class: 'alert alert-info' });
        $messagediv.append('<strong>Retrieve disabled</strong>');
        $messagediv.insertBefore('.nav-tabs');
        $('#bfeditor-previewPanel').remove();
        $('.nav-tabs a[href="#browse"]').tab('show')
      }
    });

    $loadibcdiv.append($loadibcform);

    $loadibcdiv.find('#bfeditor-loadibcuri').click(function () {
      // var loadtemplates = [];

      var spid = $(this.parentElement).find('#bfeditor-loadibc-dropdownMenu').val();
      var label = $(this.parentElement).find('#bfeditor-loadibc-dropdownMenu option:selected').text();
      $('#profileLabel').text(label + ":Instance");

      var spnums = spid.replace('sp-', '').split('_');

      var spoints = editorconfig.startingPoints[spnums[0]].menuItems[spnums[1]];

      bfestore.store = [];
      bfestore.name = guid();
      bfestore.created = new Date().toUTCString();
      bfestore.url = config.url + '/verso/api/bfs?filter=%7B%22where%22%3A%20%7B%22name%22%3A%20%22' + bfestore.name + '%22%7D%7D';
      bfestore.state = 'loaduri';
      bfestore.profile = spoints.useResourceTemplates[0];

      var temptemplates = [];
      spoints.useResourceTemplates.forEach(function (l) {
        var useguid = guid();
        var loadtemplate = {};
        loadtemplate.templateGUID = shortUUID(useguid);
        loadtemplate.resourceTemplateID = l;
        loadtemplate.embedType = 'page';
        loadtemplate.data = [];
        temptemplates.push(loadtemplate);
      });

      if (editorconfig.retrieveLDS !== undefined) {
        try {
          bfestore.loadtemplates = temptemplates;
          var url = $(this.parentElement).find('#bfeditor-loadibcuriInput').val();

          if (!url.trim().includes('instance')) {
            var $messagediv = $('<div>', { id: 'bfeditor-messagediv', class: 'main' });
            $messagediv.append('<div class="alert alert-danger" role="alert"><strong>Please choose an instance to load</strong></a></div>');
            $messagediv.insertBefore('.nav-tabs');
          } else {
            editorconfig.retrieveLDS.callback(url, bfestore, bfestore.loadtemplates, bfelog, function (result) {
              if (result instanceof Error){
                var $messagediv = $('<div>', { id: 'bfeditor-messagediv', class: 'alert alert-danger', role: 'alert' });
                $messagediv.append('<strong>'+result.message+'</strong>');
                $messagediv.insertBefore('.tabs');
              } else {
                bfestore.cleanJSONLD('update instance');

                cbLoadTemplates();
              }
            });
          }
        } catch (e) {
          $(this.parentElement).find('#bfeditor-loadworkuriInput').val('An error occured: ' + e.message);
        }
      } else {
        // retrievelds disabled
        $('#bfeditor-formdiv').empty();
        bfestore.store = [];
        // $('#table_id').DataTable().ajax.reload();
        exports.loadBrowseData()
        $messagediv = $('<div>', { id: 'bfeditor-messagediv', class: 'alert alert-info' });
        $messagediv.append('<span class="str"><h3>Retrieve disabled</h3></span>');
        $messagediv.insertBefore('.nav-tabs');
        $('#bfeditor-previewPanel').remove();
        $('[href=\\#browse]').tab('show');
      }
    });

    $loadmarcdiv.append($('<div class="container"> \
              <form role="form" method="get"> \
              <div class="form-group"> \
              <label for="marcdx">Identifier</label> \
              <div class="input-group"> \
              <div class="input-group-btn"> \
              <button type="button" id="marcdx" class="btn btn-default dropdown-toggle" data-toggle="dropdown">Bib ID <span class="caret"></span></button> \
              <ul class="dropdown-menu"> \
              <li><a href="#" id="bibid">Bib ID</a></li> \
              <li><a href="#" id="lccn">LCCN</a></li> \
              <li><a href="#" id="oclc">OCLC</a></li> \
              </ul></div> \
              <input id="bfeditor-loadmarcterm" class="form-control" placeholder="Enter Bib ID, LCCN or OCLC number" type="text" name="url"></div> \
              <input type="hidden" id="loadmarc-uri"></hidden>\
              <label for="bfeditor-loadmarc-dropdown">Choose Profile</label> \
              <div id="bfeditor-loadmarc-dropdown" class="dropdown"><select id="bfeditor-loadmarc-dropdownMenu" type="select" class="form-control">Select Profile</select></div></div> \
              <button id="bfeditor-loadmarc" type="button" class="btn btn-primary">Submit</button> \
              </form></div>'));

    

    $loadmarcdiv.find('.dropdown-menu > li > a').click(function () {
      $('#marcdx').html($(this).text() + ' <span class="caret">');
    });
    $loadmarcdiv.find('#bfeditor-loadmarc').click(function () {
      var term = $('#bfeditor-loadmarcterm').val();
      var dx = 'rec.id';
      var url;

      if ($('#marcdx').text().match(/LCCN/i)) {
        dx = 'bath.lccn';
      }

      if ($('#marcdx').text().match(/OCLC/i)) {
        url = config.url + '/bfe/server/retrieveOCLC?oclcnum='+ term + '&oclckey=' + editorconfig.oclckey;
      } else {
        url = 'http://lx2.loc.gov:210/LCDB?query=' + dx + '=' + term + '&recordSchema=bibframe2a&maximumRecords=1';
      }
      $('#loadmarc-uri').attr('value', url);
    });

    $tabcontentdiv.append($browsediv);
    $tabcontentdiv.append($creatediv);
    $tabcontentdiv.append($loadworkdiv);
    $tabcontentdiv.append($loadibcdiv);
    $tabcontentdiv.append($loadmarcdiv);

    $tabcontentdiv.find('#bfeditor-loaduri, #bfeditor-loadmarc').click(function () {
      var spoints = {};

      if (this.id == 'bfeditor-loadmarc') {
        var spid = $(this.parentElement).find('#bfeditor-loadmarc-dropdownMenu').val();

        var label = $(this.parentElement).find('#bfeditor-loadmarc-dropdownMenu option:selected').text();
        $('#profileLabel').text(label + ":Work");

        var spnums = spid.replace('sp-', '').split('_');
        spoints = editorconfig.startingPoints[spnums[0]].menuItems[spnums[1]];
        bfestore.state = 'loadmarc';
      } else {
        spoints = {
          label: 'Loaded Work',
          type: ['http://id.loc.gov/ontologies/bibframe/Work'],
          useResourceTemplates: ['lc:RT:bf2:Monograph:Work']
        };
        bfestore.state = 'loaduri';
      }

      bfestore.store = [];
      bfestore.name = guid();
      bfestore.created = new Date().toUTCString();
      bfestore.url = config.url + '/verso/api/bfs?filter=%7B%22where%22%3A%20%7B%22name%22%3A%20%22' + bfestore.name + '%22%7D%7D';
      // bfestore.state = 'loaduri';
      bfestore.profile = spoints.useResourceTemplates[0];

      var temptemplates = [];
      spoints.useResourceTemplates.forEach(function (l) {
        var useguid = guid();
        var loadtemplate = {};
        loadtemplate.templateGUID = shortUUID(useguid);
        loadtemplate.resourceTemplateID = l;
        loadtemplate.embedType = 'page';
        loadtemplate.data = [];
        temptemplates.push(loadtemplate);
      });

      if (editorconfig.retrieve.callback !== undefined) {
        try {
          bfestore.loadtemplates = temptemplates;
          var url = $(this.parentElement).find('#bfeditor-loaduriInput, #loadmarc-uri').val();
          editorconfig.retrieve.callback(url, bfestore, bfestore.loadtemplates, bfelog, function (result) {
            if (result instanceof Error){
              var $messagediv = $('<div>', { id: 'bfeditor-messagediv', class: 'alert alert-danger', role: 'alert' });
              $messagediv.append('<strong>'+result.message+'</strong>');
              $messagediv.insertBefore('.tabs');
            } else {
              bfestore.cleanJSONLD('external marc');           
              
              bfestore.loadtemplates.data = bfestore.store;
              
              $('#bfeditor-formdiv').empty();

              // weird bnode prob
              _.each(bfestore.store, function (el) {
                if (el.o !== undefined && el.o.startsWith('_:_:')) { el.o = '_:' + el.o.split('_:')[2]; }
              });

              cbLoadTemplates();
            }
          });
        } catch (e) {
          $(this.parentElement).find('#bfeditor-loaduriInput').val('An error occured: ' + e.message);
        }
      } else {
        // retrieve disabled
        $(this.parentElement).find('#bfeditor-loaduriInput').val('This function has been disabled');
      }
    });


    $containerdiv.append($tabcontentdiv);

    $(editordiv).append($containerdiv);
    
    exports.fulleditor(config, "create");

    // Debug div
    if (editorconfig.logging !== undefined && editorconfig.logging.level !== undefined && editorconfig.logging.level == 'DEBUG') {
      var $debugdiv = $('<div id="bfeditor-debugdiv" class="col-md-12 main panel-group">\
                           <div class="panel panel-default"><div class="panel-heading">\
                           <h3 class="panel-title"><a role="button" data-toggle="collapse" href="#debuginfo">Debug output</a></h3></div>\
                           <div class="panel-collapse collapse in" id="debuginfo"><div class="panel-body"><pre id="bfeditor-debug"></pre></div></div></div>\
                           </div>');
      $(editordiv).append($debugdiv);
      var $debugpre = $('#bfeditor-debug');
      $debugpre.html(JSON.stringify(profiles, undefined, ' '));
    }

    var $footer = $('<footer>', {
      class: 'footer'
    });
    $(editordiv).append($footer);

    $('a[data-toggle="tab"]').click(function (e) {
      $('.alert').remove();
      bfelog.addMsg(new Error(), 'INFO', e.type + " " + e.target);
    });
    
    $(function(){
      $('#bfeditor-loadworkuri').prop('disabled', false);
      $('#bfeditor-loadibcuri').prop('disabled', false);
    });

    $(window).bind('beforeunload', function(){
      return 'Are you sure you want to leave?';
    });

    return {
      'profiles': profiles,
      'div': editordiv,
      'bfestore': bfestore,
      'bfelog': bfelog
    };
  };




  exports.fulleditor = function (config, id) {
    if (this.enteredfunc === null) {
        this.enteredfunc = "fulleditor";
    }
    this.setConfig(config);
    editordiv = document.getElementById(id);
    
    var $menudiv = $('<div>', {
      id: 'bfeditor-menudiv',
      class: 'navbar navbar-expand-lg navbar-light bg-light col-md-10'
    });
    var $formdiv = $('<div>', {
      id: 'bfeditor-formdiv',
      class: 'col-md-10 main'
    });
    var $rowdiv = $('<div>', {
      class: 'row'
    });

    var $loader = $('<div><br /><br /><h2>Loading...</h2><div class="progress progress-striped active">\
                          <div class="progress-bar progress-bar-info" id="bfeditor-loader" role="progressbar" aria-valuenow="100" aria-valuemin="0" aria-valuemax="100" style="width: 20%">\
                              <span class="sr-only">80% Complete</span>\
                          </div>\
                      </div>');

    $formdiv.append($loader);

    $menudiv.append('<span id="profileLabel" style="display: none"></span>');

    var $createResourcediv = $('<div class="dropdown pull-left" style="padding-right: 10px">');
    var $createResourceButton = $('<button class="btn btn-primary dropdown-toggle" type="button" data-toggle="dropdown" data-target=".dropdown-collapse">\
    <span class="glyphicon glyphicon-plus"></span> Create Resource </span></button>');
    
    $createResourcediv.append($createResourceButton);
    $menudiv.append($createResourcediv);

    $rowdiv.append($menudiv);
    $rowdiv.append($formdiv);

    $(editordiv).append($rowdiv);

    var $createResourcemenuul = $('<ul id="createResourcemenuul" class="dropdown-menu"></ul>');
    
    editorconfig.setStartingPoints.callback(config, function (config) {
      for (var h = 0; h < config.startingPoints.length; h++) {
        var sp = config.startingPoints[h];
        var $createResourcesubmenuul = null;
        if (typeof sp.menuGroup !== undefined && sp.menuGroup !== '') {
          var $createResourcesubmenu =  $('<li class="dropdown-submenu"><a class="test" href="#">' + sp.menuGroup + '<span class="caret-right"></span></a></li>');
          
          $createResourcesubmenuul = $('<ul id="createresourcesubmenuul" class="dropdown-menu"></ul>');
          $createResourcesubmenu.append($createResourcesubmenuul);
          $createResourcemenuul.append($createResourcesubmenu)
        }
        for (var i = 0; i < sp.menuItems.length; i++) {
          var $li = $('<li>');
          var $a = $('<a>', {
            href: '#',
            id: 'sp-' + h + '_' + i,
            class: "test",
            tabindex: "-1"
          });
          $a.html(sp.menuItems[i].label);
          $a.click(function (event) {
            var profile = $($(event.target.parentElement.parentElement.parentElement).contents()[0]).text();
            $('#createresourcesubmenuul.open').hide();
            $('#createresourcesubmenuul.open').removeClass('open');
            $('#profileLabel').text(profile + ":" + event.target.text);
            
            menuSelect(this.id);
          });
          $li.append($a);

          if ($createResourcesubmenuul !== null) {
            $createResourcesubmenuul.append($li)
          } else {
            $createResourcemenuul.append($li)
          }
        }
        $createResourcediv.append($createResourcemenuul);

      }

      var getProfileOptions = 
       function (jqObject, elementType) {
        for (var h = 0; h < config.startingPoints.length; h++) {
          var sp = config.startingPoints[h];
          var label = sp.menuGroup
          for (var i = 0; i < sp.menuItems.length; i++) {
            var $option = $('<option>', {
              class: 'dropdown-item',
              value: 'sp-' + h + '_' + i
            });
            if (sp.menuItems[i].type[0] === elementType) {
              $option.html(label);
              jqObject.append($option);
            }
          }
        }
      }
      $(function(){
        $('.dropdown-submenu>a').unbind('click').click(function(e){
          var $openmenu = $('#createresourcesubmenuul.open');
          $openmenu.hide();
          $openmenu.removeClass('open');
          var $dropdown = $(this).next('ul');
          $dropdown.addClass('open');
          $dropdown.toggle();
          e.stopPropagation();
          e.preventDefault();
        });
      });

    });

    // Debug div
    if (editorconfig.logging !== undefined && editorconfig.logging.level !== undefined && editorconfig.logging.level == 'DEBUG') {
      var $debugdiv = $('<div id="bfeditor-debugdiv" class="col-md-12 main panel-group">\
                           <div class="panel panel-default"><div class="panel-heading">\
                           <h3 class="panel-title"><a role="button" data-toggle="collapse" href="#debuginfo">Debug output</a></h3></div>\
                           <div class="panel-collapse collapse in" id="debuginfo"><div class="panel-body"><pre id="bfeditor-debug"></pre></div></div></div>\
                           </div>');
      $(editordiv).append($debugdiv);
      var $debugpre = $('#bfeditor-debug');
      $debugpre.html(JSON.stringify(profiles, undefined, ' '));
    }

    var $footer = $('<footer>', {
      class: 'footer'
    });
    $(editordiv).append($footer);

    if (loadtemplatesANDlookupsCount === 0) {
      // There was nothing to load, so we need to get rid of the loader.
      $formdiv.html('');
    }

    $('a[data-toggle="tab"]').click(function (e) {
      $('.alert').remove();
      bfelog.addMsg(new Error(), 'INFO', e.type + " " + e.target);
    });
    
    $(window).bind('beforeunload', function(){
      return 'Are you sure you want to leave?';
    });

    return {
      'profiles': profiles,
      'div': editordiv,
      'bfestore': bfestore,
      'bfelog': bfelog
    };
  };

  exports.editor = function (config, id) {
    this.enteredfunc = "editor";
    this.setConfig(config);

    editordiv = document.getElementById(id);

    var $formdiv = $('<div>', {
      id: 'bfeditor-formdiv',
      class: 'col-md-12'
    });

    // var optiondiv = $('<div>', {id: "bfeditor-optiondiv", class: "col-md-2"});

    var $rowdiv = $('<div>', {
      class: 'row'
    });

    $rowdiv.append($formdiv);
    // rowdiv.append(optiondiv);

    $(editordiv).append($rowdiv);

    // Debug div
    if (editorconfig.logging !== undefined && editorconfig.logging.level !== undefined && editorconfig.logging.level == 'DEBUG') {
      var $debugdiv = $('<div>', {
        class: 'col-md-12'
      });
      $debugdiv.html('Debug output');
      var $debugpre = $('<pre>', {
        id: 'bfeditor-debug'
      });
      $debugdiv.append($debugpre);
      $(editordiv).append($debugdiv);
      $debugpre.html(JSON.stringify(profiles, undefined, ' '));
    }

    var $footer = $('<div>', {
      class: 'col-md-12'
    });
    $(editordiv).append($footer);

    return {
      'profiles': profiles,
      'div': editordiv,
      'bfestore': bfestore,
      'bfelog': bfelog
    };
  };

  function setLookup(r) {
    if (r.scheme !== undefined) {
      bfelog.addMsg(new Error(), 'INFO', 'Setting up scheme ' + r.scheme);
      var lu = this.config.lookups[r.scheme];
      lookups[r.scheme] = {};
      lookups[r.scheme].name = lu.name;
      lookups[r.scheme].load = r;
    } else {
      bfelog.addMsg(new Error(), 'WARN', 'Loading lookup FAILED', r);
    }
  }

  var cbLoadTemplates = exports.cbLoadTemplates = function(propTemps) {
    //clear the URL params
    window.history.replaceState(null, null, window.location.pathname);
    
    bfe.exitButtons(editorconfig);

    $('#bfeditor-loader').width($('#bfeditor-loader').width() + 5 + '%');
    loadtemplatesANDlookupsCounter++;
    var loadtemplates = bfestore.loadtemplates;

    if (loadtemplatesANDlookupsCounter >= loadtemplatesANDlookupsCount) {
      $('#bfeditor-formdiv').html('');
      if (loadtemplates.length > 0) {
        bfelog.addMsg(new Error(), 'DEBUG', 'Loading selected template(s)', loadtemplates);
        var form = getForm(loadtemplates, propTemps);
        $('.typeahead', form.form).each(function () {
          setTypeahead(this);
        });
        
        $('<input>', {
          type: 'hidden',
          id: 'profile-id',
          value: loadtemplates[0].resourceTemplateID
        }).appendTo(form.form);

        var exitFunction = function () {
          $('#cloneButtonGroup').remove();
          $('#exitButtonGroup').remove();
          $('#bfeditor-previewPanel').remove();
          
          $('#bfeditor-formdiv').show();
          $('#bfeditor-formdiv').empty();
          $('[href=\\#browse]').tab('show');
          window.location.hash = '';
          bfestore.store = [];
          $('#table_id').DataTable().search('').draw();
          exports.loadBrowseData();
        }

        $('#bfeditor-exitcancel').click(function () {
          exitFunction();
        });

        var $messagediv;
               
        $('#bfeditor-exitsave').click(function () {
          $('.alert').remove();
          if (editorconfig.save !== undefined) {
            //        to_json= {'name': dirhash,'dir' : savedir,'url' : jsonurl,'rdf' : jsonobj}
            // var dirhash = guid();
            var save_json = {};
            save_json.name = bfestore.name;
            save_json.profile = bfestore.profile;
            save_json.url = config.url + '/verso/api/bfs?filter=%7B%22where%22%3A%20%7B%22name%22%3A%20%22' + bfestore.name + '%22%7D%7D';
            save_json.created = bfestore.created;
            save_json.modified = new Date().toUTCString();

            if (_.some(bfestore.store, { 'p': 'http://id.loc.gov/ontologies/bibframe/adminMetadata' })) {
              var modifiedDate = new Date(save_json.modified);
              var modifiedDateString = modifiedDate.toJSON().split(/\./)[0];

              if (_.some(bfestore.store, { p: 'http://id.loc.gov/ontologies/bibframe/changeDate' })) {
                _.each(_.where(bfestore.store, { p: 'http://id.loc.gov/ontologies/bibframe/changeDate' }), function (cd) {
                  cd.o = modifiedDateString;
                });
              } else {
                var adminTriple = {};
                adminTriple.s = _.find(bfestore.store, { 'p': 'http://id.loc.gov/ontologies/bibframe/adminMetadata' }).o;
                adminTriple.p = 'http://id.loc.gov/ontologies/bibframe/changeDate';
                adminTriple.o = modifiedDateString;
                adminTriple.otype = 'literal';
                bfestore.store.push(adminTriple);
              }
            }

            save_json.rdf = bfestore.store2jsonldExpanded();
            save_json.addedproperties = addedProperties;

            if (_.some(bfestore.store, { 'p': 'http://id.loc.gov/ontologies/bibframe/mainTitle' })) {
              editorconfig.save.callback(save_json, bfelog, function (save, save_name) {
                exitFunction();
                bfelog.addMsg(new Error(), 'INFO', 'Saved: ' + save_name);
              });
            } else {
              // title required
              $messagediv = $('<div>', { id: 'bfeditor-messagediv', class: 'alert alert-danger', role: 'alert' });
              $messagediv.append('<strong>No title found:</strong><a href=' + bfestore.url + '>' + mintResource(bfestore.name) + '</a>');
              $messagediv.insertBefore('.tabs');
            }
          } else {
            // save disabled
            $messagediv = $('<div>', { id: 'bfeditor-messagediv', class: 'alert alert-info' });
            $messagediv.append('<span class="str"><h3>Save disabled</h3></span>');
            $messagediv.insertBefore('.nav-tabs');
          }
          
        });

        $('#bfeditor-exitpublish').click(function () {
          $('.alert').remove();
          if (editorconfig.publish !== undefined) {
            if (_.some(bfestore.store, { 'p': 'http://id.loc.gov/ontologies/bibframe/mainTitle' })) {
              bfestore.store2rdfxml(bfestore.store2jsonldExpanded(), function (rdfxml) {
                //var rdfxml = $("#rdfxml .panel-body pre").text();
                var save_json = {};
                save_json.name = mintResource(bfestore.name);
                save_json.profile = bfestore.profile;
                save_json.url = bfestore.url;
                save_json.created = bfestore.created;
                save_json.modified = new Date().toUTCString();

                if (_.some(bfestore.store, { 'p': 'http://id.loc.gov/ontologies/bibframe/adminMetadata' })) {
                  var modifiedDate = new Date(save_json.modified);
                  var modifiedDateString = modifiedDate.toJSON().split(/\./)[0];

                  if (_.some(bfestore.store, { p: 'http://id.loc.gov/ontologies/bibframe/changeDate' })) {
                    _.each(_.where(bfestore.store, { p: 'http://id.loc.gov/ontologies/bibframe/changeDate' }), function (cd) {
                      cd.o = modifiedDateString;
                    });
                  } else {
                    var adminTriple = {};
                    adminTriple.s = _.find(bfestore.store, { 'p': 'http://id.loc.gov/ontologies/bibframe/adminMetadata' }).o;
                    adminTriple.p = 'http://id.loc.gov/ontologies/bibframe/changeDate';
                    adminTriple.o = modifiedDateString;
                    adminTriple.otype = 'literal';
                    bfestore.store.push(adminTriple);
                  }
                }

                //update profile
                if (_.some(bfestore.store, {'p': 'http://id.loc.gov/ontologies/bflc/profile'})){
                  var profile = _.find(bfestore.store, { 'p': 'http://id.loc.gov/ontologies/bflc/profile' });
                  profile.o = bfestore.profile;
                } else {
                  var admin = _.find(bfestore.store, { 'p': 'http://id.loc.gov/ontologies/bibframe/adminMetadata' }).o;
                  bfestore.addProfile(admin, bfestore.profile);
                }
                //works or instances
                var profileType = _.last(bfestore.profile.split(':')) ==='Work' ? 'works' : 'instances';

                save_json.status = 'published';
                save_json.objid = 'loc.natlib.' + profileType + '.' + save_json.name + '0001';

                var lccns;

                if (_.some(bfestore.store, {o: 'http://id.loc.gov/ontologies/bibframe/Lccn' })) {
                  var lccnType = _.where(bfestore.store, {o: 'http://id.loc.gov/ontologies/bibframe/Lccn' })[0].s
                  lccns = _.where(bfestore.store, { s: lccnType, p: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#value' })
                }

                if (!_.isEmpty(lccns)) {
                  for (var i = 0; i < lccns.length; i++) {
                    if (!lccns[i].o.trim().startsWith('n')) {
                      save_json.lccn = lccns[i].o.trim();
                      save_json.objid = 'loc.natlib.'+ profileType +'.e' + save_json.lccn + '0001';
                    }
                  }
                }

                save_json.rdf = bfestore.store2jsonldExpanded();
                editorconfig.publish.callback(save_json, rdfxml, bfestore.name, bfelog, function (published, publish_name) {
                  exitFunction();
                  bfelog.addMsg(new Error(), 'INFO', 'Publish:' + published + ' ' + publish_name);
                });
              });
            } else {
              // title required
              $messagediv = $('<div>', { id: 'bfeditor-messagediv', class: 'alert alert-danger', role: 'alert' });
              $messagediv.append('<strong>No title found:</strong><a href=' + bfestore.url + '>' + mintResource(bfestore.name) + '</a>');
              $messagediv.insertBefore('.tabs');
            }
          } else {
            // publish disabled
            $messagediv = $('<div>', { id: 'bfeditor-messagediv', class: 'alert alert-info' });
            $messagediv.append('<strong>Publishing disabled</strong>');
            $messagediv.insertBefore('.nav-tabs');
          }          
        });

        $('#bfeditor-exitcancel').attr('tabindex', tabIndices++);
        
        bfestore.defaulturi = form.formobject.defaulturi;
        $('#bfeditor-preview').click(function () {
          $('#bfeditor-preview').hide();
          //remove orphans
          bfestore.removeOrphans(bfestore.defaulturi);

          var jsonstr = bfestore.store2jsonldExpanded();

          // bfestore.store2turtle(jsonstr, humanizedPanel);
          bfestore.store2jsonldcompacted(jsonstr, jsonPanel);

          function humanizedPanel(data) {
            $('#humanized .panel-body pre').text(data);
          }

          function jsonPanel(data) {
            bfestore.store2turtle(data, humanizedPanel);

            $('#jsonld .panel-body pre').text(JSON.stringify(data, undefined, ' '));

            bfestore.store2jsonldnormalized(data, function (expanded) {
              d3.jsonldVis(expanded, '#jsonld-vis .panel-body', {
                w: 800,
                h: 600,
                maxLabelWidth: 250
              });
            });
          }

          document.body.scrollTop = document.documentElement.scrollTop = 0;
          var $backButton = $('<button id="bfeditor-exitback" type="button" class="btn btn-warning">&#9664;</button>');

          var $bfeditor = $('#create > .row');
          var $preview = $('<div id="bfeditor-previewPanel" class="col-md-10 main panel-group">\
                           <div class="panel panel-default"><div class="panel-heading">\
                           <h3 class="panel-title"><a role="button" data-toggle="collapse" href="#humanized">Preview</a></h3></div>\
                           <div class="panel-collapse collapse in" id="humanized"><div class="panel-body"><pre></pre></div></div>\
                           <div class="panel panel-default"><div class="panel-heading"><h3 class="panel-title"><a role="button" data-toggle="collapse" href="#jsonld">JSONLD</a></h3></div>\
                           <div class="panel-collapse collapse in" id="jsonld"><div class="panel-body"><pre>' + JSON.stringify(jsonstr, undefined, ' ') + '</pre></div></div>\
                           <div class="panel panel-default"><div class="panel-heading"><h3 class="panel-title"><a role="button" data-toggle="collapse" href="#rdfxml">RDF-XML</a></h3></div>\
                           <div class="panel-collapse collapse in" id="rdfxml"><div class="panel-body"><pre></pre></div></div>\
                           <div class="panel panel-default"><div class="panel-heading"><h3 class="panel-title"><a role="button" data-toggle="collapse" href="#jsonld-vis">Visualize</a></h3</div></div>\
                           <div class="panel-collapse collapse in" id="jsonld-vis"><div class="panel-body"></div></div></div>\
                           </div>');

          $('#exitButtonGroup').append($backButton);

          $('#bfeditor-exitback').click(function () {
            $('#bfeditor-exitback').remove();
            $('#bfeditor-preview').show();
            $('#bfeditor-previewPanel').remove();
            $('#bfeditor-formdiv').show();
          });

          $('#bfeditor-formdiv').hide();
          $append($preview);
        });
        $('#bfeditor-exitpreview').attr('tabindex', tabIndices++);

        $('#bfeditor-formdiv').html('');
        $('#bfeditor-formdiv').append(form.form);
        $('#bfeditor-debug').html(JSON.stringify(bfestore.store, undefined, ' '));
        $('#bfeditor-debug').html(JSON.stringify(bfelog.getLog(), undefined, ' '));

        bfestore.state = 'edit';
            
        // apply a user template if selected
        bfeusertemplates.checkActiveTemplate();
        
      }
    }
  }

    // store = new rdfstore.Store();
  function menuSelect(spid) {
    var spnums = spid.replace('sp-', '').split('_');
    var spoints = editorconfig.startingPoints[spnums[0]].menuItems[spnums[1]];
    addedProperties = [];

    bfestore.store = [];
    bfestore.name = guid();
    bfestore.templateGUID = guid();
    bfestore.created = new Date().toUTCString();
    bfestore.url = config.url + '/verso/api/bfs?filter=%7B%22where%22%3A%20%7B%22name%22%3A%20%22' + bfestore.name + '%22%7D%7D';
    bfestore.state = 'create';
    
    // Turn off edit mode of templates if they were in the middle of editing one
    bfeusertemplates.editMode = false;
    bfeusertemplates.editModeTemplate = false;

    var loadtemplates = [];

    spoints.useResourceTemplates.forEach(function (l) {
      var loadtemplate = {};
      var tempstore = [];
      loadtemplate.templateGUID = bfestore.templateGUID;
      loadtemplate.resourceTemplateID = l;
      loadtemplate.embedType = 'page';
      loadtemplate.data = tempstore;
      loadtemplates.push(loadtemplate);
      // cbLoadTemplates();
    });

    bfestore.loadtemplates = loadtemplates;

    //adminMetadata
    var rt_type = _.last(loadtemplates[0].resourceTemplateID.split(":")).toLowerCase();
    var procInfo = 'create ' + rt_type
    bfestore.profile = loadtemplates[0].resourceTemplateID;
    var defaulturi = editorconfig.baseURI + 'resources/' + rt_type + 's/' + mintResource(bfestore.templateGUID);

    bfestore.addAdminMetadata(defaulturi, procInfo);
    bfestore.loadtemplates.data = bfestore.store;

    cbLoadTemplates();
  }

  /*
    loadTemplates is an array of objects, each with this structure:
        {
            templateguid=guid,
            resourceTemplateID=resourceTemplateID,
            resourceuri="",
            embedType=modal|page
            data=bfestore
        }
    */
  function getForm(loadTemplates, pt) {
    var rt, property;
    // Create the form object.
    var fguid = guid();
    var fobject = {};
    fobject.id = fguid;
    fobject.store = [];
    fobject.resourceTemplates = [];
    fobject.resourceTemplateIDs = [];
    fobject.formTemplates = [];

    // Load up the requested templates, add seed data.
    for (var urt = 0; urt < loadTemplates.length; urt++) {
      rt = _.where(resourceTemplates, {
        'id': loadTemplates[urt].resourceTemplateID
      });
      if (rt !== undefined && rt[0] !== undefined) {
        fobject.resourceTemplates[urt] = JSON.parse(JSON.stringify(rt[0]));
        // console.log(loadTemplates[urt]);
        fobject.resourceTemplates[urt].data = loadTemplates[urt].data;
        fobject.resourceTemplates[urt].defaulturi = loadTemplates[urt].resourceURI;
        fobject.resourceTemplates[urt].useguid = loadTemplates[urt].templateGUID;
        fobject.resourceTemplates[urt].embedType = loadTemplates[urt].embedType;
        // We need to make sure this resourceTemplate has a defaulturi
        if (fobject.resourceTemplates[urt].defaulturi === undefined) {
          // fobject.resourceTemplates[urt].defaulturi = whichrt(fobject.resourceTemplates[urt], editorconfig.baseURI) + shortUUID(loadTemplates[urt].templateGUID);
          whichrt(fobject.resourceTemplates[urt], editorconfig.baseURI,
            function (baseuri) {
              var worklist = _.filter(bfestore.store, function (s) { return s.s.indexOf(baseuri) !== -1; });
              if (!_.isEmpty(worklist)) {
                // check for type
                var rtTypes = _.where(worklist, { 'p': 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type', o: fobject.resourceTemplates[urt].resourceURI });
                if (!_.isEmpty(rtTypes)) {
                  
                  fobject.resourceTemplates[urt].defaulturi = rtTypes[0].s;

                  if (fobject.resourceTemplates[urt].embedType === "page"){
                    // find uniq s, and look for one that has no o
                    rtTypes.forEach(function (rtType){
                      if(!_.some(bfestore.store, {o: rtType.s})){
                        fobject.resourceTemplates[urt].defaulturi = rtType.s;
                      }
                    });
                  }

                } else {
                  
                  var rt = fobject.resourceTemplates[urt];
                  // add type
                  var triple = {};
                  triple.guid = rt.useguid;
                  triple.rtID = rt.id;
                  triple.s = worklist[0].s;
                  triple.p = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
                  triple.o = rt.resourceURI;
                  triple.otype = 'uri';
                  // fobject.store.push(triple);
                  bfestore.addTriple(triple);

                  fobject.resourceTemplates[urt].defaulturi = triple.s;
                }
              } else {
                fobject.resourceTemplates[urt].defaulturi = baseuri + mintResource(loadTemplates[urt].templateGUID);
              }
            });
        } else {
          // fobject.resourceTemplates[urt].defaulturi = whichrt(fobject.resourceTemplates[urt], editorconfig.baseURI) + loadTemplates[urt].templateGUID;
        }

        fobject.resourceTemplateIDs[urt] = rt[0].id;
      } else {
        bfelog.addMsg(new Error(), 'WARN', 'Unable to locate resourceTemplate. Verify the resourceTemplate ID is correct.');
      }
    }

    // Let's create the form
    var form = $('<form>', {
      id: 'bfeditor-form-' + fobject.id,
      class: 'form-horizontal',
      role: 'form'
    });
    
    form.submit(function(e){
        e.preventDefault();
    });
    
    var forEachFirst = true;
    if (pt) {
      fobject.resourceTemplates[0].propertyTemplates = pt;
    }

    fobject.resourceTemplates.forEach(function (rt) {
      bfelog.addMsg(new Error(), 'DEBUG', 'Creating form for: ' + rt.id, rt);
      var $resourcediv = $('<div>', {
        id: rt.useguid,
        'data-uri': rt.defaulturi
      }); // is data-uri used?

      // create a popover box to display resource ID of the thing.
      var $resourcedivheading = $('<div>');
      var $resourcedivheadingh4 = $('<h4 id="resource-title" class="pull-left" style="margin-right:5px">');
      $resourcedivheadingh4.text($('#profileLabel').text());

      if (rt.defaulturi.match(/^http/)) {
        var rid = rt.defaulturi;
        var rLabel = _.find(bfestore.store, {"s": rid, "p": "http://www.w3.org/2000/01/rdf-schema#label"});        
        var $resourceInfo = $('<a><span class="glyphicon glyphicon-info-sign"></span></a>');
        $resourceInfo.attr('data-content', rid);
        $resourceInfo.attr('data-toggle', 'popover');
        $resourceInfo.attr('title', !_.isEmpty(rLabel)? rLabel.o : 'Resource ID');
        $resourceInfo.attr('id', 'resource-id-popover');
        $resourceInfo.popover({ trigger: "click hover" });
        $resourcedivheadingh4.append($resourceInfo);
      }
      if (rt.embedType != 'modal') {
        $resourcedivheading.append($resourcedivheadingh4);
      }

      //clean up
      //$('#cloneButtonGroup').remove();
      
      var $templateCloneButtonGroup;
      if ($('#cloneButtonGroup').length > 0){
        $templateCloneButtonGroup = $('#cloneButtonGroup');
        if (rt.id.match(/:Instance$/i)) {
            $clonebutton = $('#clone-instance')
        } else if (rt.id.match(/:Work$/i)) {
            $clonebutton = $('#clone-work')
        }
      } else {
        $templateCloneButtonGroup = $('<div>', {id: 'cloneButtonGroup', class: 'pull-right'});
        // create an empty clone button
        if (this.enteredfunc == "lcapplication") {
            var $clonebutton = $('<button type="button" class="pull-right btn btn-primary" data-toggle="modal" data-target="#clone-input"></button>');
            // populate the clone button for Instance or Work descriptions
            if (rt.id.match(/:Instance$/i)) {
                $clonebutton.attr('id', 'clone-instance');
                $clonebutton.html('<span class="glyphicon glyphicon-duplicate"></span> Clone Instance');
                $clonebutton.data({ 'match': 'instances', 'label': 'Instance' });
            } else if (rt.id.match(/:Work$/i)) {
                $clonebutton.attr('id', 'clone-work');
                $clonebutton.html('<span class="glyphicon glyphicon-duplicate"></span> Clone Work');
                $clonebutton.data({ 'match': 'works', 'label': 'Work' });
            }
            $templateCloneButtonGroup.append($clonebutton);
        }
      }
    
      // append to the resource heading if there is a clone button id and is not a modal window      
      if ($clonebutton && $clonebutton.attr('id') && rt.embedType != 'modal') {
        var newid = mintResource(guid());

        // ask user to input custom id
        var $cloneinput = $('<div id="clone-input" class="modal" tabindex="-1" role="dialog">\
              <div class="modal-dialog" role="document">\
                <div class="modal-content">\
                  <div class="modal-header">\
                    <h4 class="modal-title">Clone ' + $clonebutton.data('label') + '</h4>\
                    <!-- <button type="button" class="close" data-dismiss="modal"><span>&times;</span></button> -->\
                  </div>\
                  <div class="modal-body">\
                      <div class="input-group col-xs-12">\
                        <span class="input-group-addon">New Resource ID:</span>\
                        <input type="text" class="form-control" id="resource-id" value="' + newid + '">\
                        <span class="input-group-btn">\
                          <button class="btn btn-default" type="button" id="clear-id">Clear</button>\
                        </span>\
                      </div>\
                  </div>\
                  <div class="modal-footer">\
                    <button type="button" class="btn btn-primary" id="clone-save">Save</button>\
                    <button type="button" class="btn btn-default" data-dismiss="modal">Cancel</button>\
                  </div>\
                </div>\
              </div>\
            </div>');
        $resourcediv.append($cloneinput);
      }
      
    // add in the template select next to the clone button, pass the profile name, looks something like 'profile:bf2:Monograph:Work'
    if (editorconfig.enableUserTemplates){
        var activeProfile = loadTemplates.map(function(t){ return t.resourceTemplateID}).join('-');
        $('.template-controls').remove();
        $templateCloneButtonGroup.append(bfeusertemplates.returnSelectHTML(activeProfile));
    }

      $('#bfeditor-menudiv').append($templateCloneButtonGroup);

      $resourcediv.append($resourcedivheading);

      $resourcediv.find('#clear-id').click(function () {
        $('#resource-id').attr('value', '');
        $('#resource-id').focus();
      });

      // the cloning starts here if clone button is clicked
      $resourcediv.find('#clone-save').click(function () {
        var rid = $('#resource-id').attr('value');
        $('#clone-input').modal('hide');
        var $msgnode = $('<div>', { id: "bfeditor-messagediv" });
        var olduri = rt.defaulturi;

        bfestore.name = guid();  // verso save name
        // var rid = mintResource(guid()); // new resource id
        var ctype = $clonebutton.data('label'); // get label for alert message
        var re = RegExp('(/' + $clonebutton.data('match') + '/)[^/]+?(#.+$|$)'); // match on part of uri ie. /works/ or /instances/

        // change all subjects in the triple store that match /instances/ or /works/ and assign new resource id
        bfestore.store.forEach(function (trip) {
          trip.s = trip.s.replace(re, "$1" + rid + "$2");
          trip.o = trip.o.replace(re, "$1" + rid + "$2");
        });

        //remove lccn
        var lccns = _.where(bfestore.store, { o: 'http://id.loc.gov/ontologies/bibframe/Lccn' });
        if (lccns !== undefined) {
          lccns.forEach(function (lccn) {
            bfestore.store = _.without(bfestore.store, _.findWhere(bfestore.store, { s: lccn.s }));
            bfestore.store = _.without(bfestore.store, _.findWhere(bfestore.store, { o: lccn.s }));
          });
        }

        _.each(_.where(bfestore.store, { 'p': 'http://id.loc.gov/ontologies/bibframe/adminMetadata' }), function (am) {
          //delete old procInfo
          bfestore.addProcInfo(am.o, 'clone ' + $clonebutton.data().label.toLowerCase());
        });

        // reload the newly created template
        cbLoadTemplates();


        // start checking for errors (basically check for remnants of old resource IDs)
        var errs = 0;
        bfestore.store.forEach(function (trip) {
          if (trip.s == olduri) {
            errs++;
          }
        });

        //disable clone button
        $('#clone-work, #clone-instance').attr("disabled", "disabled");


        if (errs > 0) {
          $msgnode.append('<div class="alert alert-danger">Old ' + ctype + ' URIs found in cloned description. Clone failed!<button type="button" class="close" data-dismiss="alert"><span>&times; </span></button></div>');
        } else {
          $msgnode.append('<div class="alert alert-info">' + ctype + ' cloned as ' + rid + '<button type="button" class="close" data-dismiss="alert"><span>&times; </span></button></div>');
        }
        $msgnode.insertBefore('.nav-tabs');
      });

      var $formgroup = $('<div>', {
        class: 'form-group row'
      });
      var $saves = $('<div class="form-group row"><div class="btn-toolbar col-sm-12" role="toolbar"></div></div></div>');
      // var $label = $('<label for="' + rt.useguid + '" class="col-sm-3 control-label" title="'+ rt.defaulturi + '">Set label?</label>');
      var $resourceinput = $('<div class="col-sm-6"><input type="text" class="form-control" id="' + rt.useguid + '" tabindex="' + tabIndices++ + '"></div>');
      var $button = $('<div class="btn-group btn-group-md span1"><button type="button" class="btn btn-default" tabindex="' + tabIndices++ + '">&#10133;</button></div>');
      var $linkbutton = $('<button type="button" class="btn btn-default" tabindex="' + tabIndices++ + '">&#x1f517;</button></div>');
      var $linkmodal = $('<div class="modal fade" id="linkmodal' + rt.useguid + '" role="dialog"><div class="modal-dialog"><div class="modal-content"> \
        <div class="modal-header"><button type="button" class="close" data-dismiss="modal">x</button><h4 class="modal-title">Link</h4></div> \
        <div class="modal-body">' + rt.defaulturi + '</div></div></div></div>');

      $button.click(function () {
        setRtLabel(fobject.id, rt.useguid, rt.useguid + ' input', rt);
      });

      $linkbutton.click(function () {
        $('#bfeditor').append($linkmodal);
        $('#linkmodal' + rt.useguid).modal();
        $('#linkmodal' + rt.useguid).on('show.bs.modal', function () {
          $(this).css('z-index', 10000);
        });
      });

      var enterHandler = function (event) {
        if (event.keyCode == 13) {
          setRtLabel(fobject.id, rt.useguid, property.guid);
          if ($('#' + property.guid).parent().parent().next().find("input:not('.tt-hint')").length) {
            $('#' + property.guid).parent().parent().next().find("input:not('.tt-hint')").focus();
          }else if ($('#' + property.guid).parent().parent().next().find("button:not([class^='bfeditor-modalCancel'])").length) {
            $('#' + property.guid).parent().parent().next().find("button").focus();
          } else {
            $('[id^=bfeditor-modalSave]').focus();
          }
        }
      };

      $resourceinput.keyup(enterHandler);
      $resourceinput.append($saves);
      $resourcediv.append($formgroup);
      var addPropsUsed = {};
      if (addedProperties !== undefined && rt.embedType == 'page' && !pt) {
        addedProperties.forEach(function (adata) {
          rt.propertyTemplates.push(adata);
        });
      }

      // adding Admin Metadata to Work, instance, Item
      if (RegExp(/(Work|Instance|Item)$/).test(rt.id) && !_.some(rt.propertyTemplates, { "propertyURI": "http://id.loc.gov/ontologies/bibframe/adminMetadata" })) {
        var adminProp = {
          "mandatory": "false",
          "repeatable": "false",
          "type": "resource",
          "resourceTemplates": [],
          "valueConstraint": {
            "valueTemplateRefs": ["lc:RT:bf2:AdminMetadata:BFDB"],
            "useValuesFrom": [],
            "valueDataType": {},
            "defaults": []
          },
          "propertyURI": "http://id.loc.gov/ontologies/bibframe/adminMetadata",
          "propertyLabel": "Administrative Metadata"
        };
        rt.propertyTemplates.push(adminProp);
      }      

      rt.propertyTemplates.forEach(function (property) {
        // Each property needs to be uniquely identified, separate from
        // the resourceTemplate.
        var pguid = shortUUID(guid());
        property.guid = pguid;
        property.display = 'true';
        addPropsUsed[property.propertyURI] = 1;
        var $formgroup = $('<div>', {
          class: 'form-group row template-property'
        });
   
        // add the uri to the data of the element
        $formgroup.data('uriLabel',property.propertyURI+'|'+property.propertyLabel);


        var $saves = $('<div class="form-group row" style="width:90%;"><div class="btn-toolbar col-sm-12" role="toolbar"></div></div></div>');
        var $label = $('<label for="' + property.guid + '" class="col-sm-2 control-label" title="' + ((property.remark) ? property.remark : "") + '"></label>');
            
        if (rt.embedType != 'modal') {
          // add in the on/off switch for making templates, pass it the uri|label combo as well so it knows to set it on off flag
          if (property.mandatory !== true && property.mandatory !== "true"){
            $label.append(bfeusertemplates.returnToggleHTML(property.propertyURI+'|'+property.propertyLabel));
          }         
        }
        
        if ((/^http/).test(property.remark)) {
          $label.append('<a href="' + property.remark + '" target="_blank">' + property.propertyLabel + '</a>')
        }else{
          $label.append("<span>"+ property.propertyLabel + "</span>")        
        }
        
        
        var $input;
        var $button;
        var $selectLang
        var $literalCol
        
        if (property.type.indexOf('literal') > -1) {
        
          var vpattern = (property.valueConstraint.validatePattern !== undefined) ? ' pattern="' + property.valueConstraint.validatePattern + '"' : '';
          
          $literalCol = $('<div class="col-sm-10"></div>');
          var $inputHolder = $('<div class="input-group literal-input-group"></div>');
          $literalCol.append($inputHolder);
          
          
          $input = $('<input type="text" class="form-control literal-input" id="' + property.guid + '"' + vpattern + ' tabindex="' + tabIndices++ + '">');
          
          $inputHolder.append($input);
          

          
         
          if (property.type == 'literal-lang') {
            
            var $buttonGroupHolder = $('<div class="input-group-btn" ></div>');
          
            $selectLang = $('<select id="' + property.guid + '-lang" class="form-control literal-select"' + ' tabindex="' + tabIndices++ + '"><option>lang</option></select>');
            
            // add in all the languages
            bfeliterallang.iso6391.forEach(function(l){
                $selectLang.append($('<option value="'+ l.code + '">'+ l.code + ' (' + l.name + ')' +'</option>'));
            });
            
            $inputHolder.append($selectLang);
            var $selectScript = $('<select id="' + property.guid + '-script" class="form-control literal-select"' + ' tabindex="' + tabIndices++ + '"><option></option></select>');
            // add in all the languages
            bfeliterallang.iso15924.forEach(function(s){
                $selectScript.append($('<option value="'+ s.alpha_4 + '">'+ s.alpha_4 + ' (' + s.name + ')' +'</option>'));
            });
            
            
            $inputHolder.append($selectScript);
            
            // if they go to correct it remove 
            $selectLang.on('click change',function(){$(this).removeClass('literal-select-error-start')});
            $selectScript.on('click change',function(){$(this).removeClass('literal-select-error-start')});
            
        
          }else{
            // not building a literal lang input, need to float the + button over to the left
            $buttonGroupHolder = $('<div class="input-group-btn pull-left" ></div>');
          }
          
          $button = $('<button type="button"  class="btn btn-default" tabindex="' + tabIndices++ + '">&#10133;</button>');
          
          $buttonGroupHolder.append($button);
          
          $inputHolder.append($buttonGroupHolder);
          
          $button.click(function () {
            if (!document.getElementById(property.guid).checkValidity()){
            //if ($input.find(':invalid').length == 1) {
              alert('Invalid Value!\nThe value should match: ' + property.valueConstraint.validatePattern);
              return false;
            } else {
            
              // dont allow if the script or lang is blank
              if (property.type == 'literal-lang') {
                if ($('#' + property.guid).next().val() == 'lang'){
                  $('#' + property.guid).next().addClass('literal-select-error-start');
                  return false;
                }                

                // if ($('#' + property.guid).next().next().val() == ''){
                  // $('#' + property.guid).next().next().addClass('literal-select-error-start');
                  // return false;
                // }              
              }
            
            
              setLiteral(fobject.id, rt.useguid, property.guid);
            }
          });
          
          

          var enterHandler = function (event) {
            if (event.keyCode == 13) {
              if (!document.getElementById(property.guid).checkValidity()) {
                    alert('Invalid Value!\nThe value should match: ' + property.valueConstraint.validatePattern);
                    return false;
              } else if (property.type == 'literal-lang') {
                if ($('#' + property.guid).next().val() == 'lang'){
                  $('#' + property.guid).next().addClass('literal-select-error-start');
                  return false;
                }                

                // if ($('#' + property.guid).next().next().val() == ''){
                  // $('#' + property.guid).next().next().addClass('literal-select-error-start');
                  // return false;
                // }              
              }
              // this prevents the select boxs from open the dropdown on enter press
              event.preventDefault();
            
              setLiteral(fobject.id, rt.useguid, property.guid);
              
              // this trys to auto select the next possible input like a input or button
              if ($('#' + property.guid).parent().parent().parent().next().find("input:not('.tt-hint')").length) {
                $('#' + property.guid).parent().parent().parent().next().find("input:not('.tt-hint')").focus();
              }else if ($('#' + property.guid).parent().parent().parent().next().find("button:not([class^='bfeditor-modalCancel'])").length) {
                  $('#' + property.guid).parent().parent().parent().next().find("button").focus();
              } else {
                $('[id^=bfeditor-modalSave]').focus();
              }
            }else if (event.keyCode == 54 && event.ctrlKey && event.altKey) {
              var text = this.value;
              this.value = text + '\u00A9';
            } else if (event.keyCode == 53 && event.ctrlKey && event.altKey) {
              this.value = this.value + '\u2117';
            }else if ($('#' + property.guid)[0].nodeName.toLowerCase() == 'input'){
              // send off the text to try to guess the lang or script
              var results = bfeliterallang.identifyLangScript($(this).val());
              // if we get results for either set them in the select boxes follow this input
              if (results.iso6391){
                $('#' + property.guid).next().val(results.iso6391)
              }
              if (results.script){
                $('#' + property.guid).next().next().val(results.script)
              }
              
            }            
          };

          $input.keyup(enterHandler);
          
          // also handel enter keys press on the select
          if ($selectLang){
            $selectLang.keypress(enterHandler);
            $selectScript.keypress(enterHandler);
          
          }

          // this is where the added data shows up, so it will appear below the inputbox
          $literalCol.append($saves);
          
          $formgroup.append($label);
          $formgroup.append($literalCol);

        }

        if (property.type.indexOf('literal') === -1) {
          if (_.has(property, 'valueConstraint')) {
            if (_.has(property.valueConstraint, 'valueTemplateRefs') && !_.isEmpty(property.valueConstraint.valueTemplateRefs)) {
              var $buttondiv = $('<div class="col-sm-8" id="' + property.guid + '"></div>');
              var $buttongrp = $('<div class="btn-group btn-group-md"></div>');
              var vtRefs = property.valueConstraint.valueTemplateRefs;
              for (var v = 0; v < vtRefs.length; v++) {
                var vtrs = vtRefs[v];
                var valueTemplates = _.where(resourceTemplates, {
                  'id': vtrs
                });
                if (valueTemplates[0] !== undefined) {
                  var vt = valueTemplates[0];
                  // console.log(vt);
                  var $b = $('<button type="button" class="btn btn-default" tabindex="' + tabIndices++ + '">' + vt.resourceLabel + '</button>');
                  var pid = property.guid;
                  var newResourceURI = '_:bnode' + shortUUID(guid());
                  $b.click({
                    fobjectid: fobject.id,
                    newResourceURI: newResourceURI,
                    propertyguid: pid,
                    template: vt
                  }, function (event) {
                    var theNewResourceURI = '_:bnode' + shortUUID(guid());
                    openModal(event.data.fobjectid, event.data.template, theNewResourceURI, event.data.propertyguid, []);
                  });
                  $buttongrp.append($b);
                }
              }
              $buttondiv.append($buttongrp);

              $formgroup.append($label);
              $buttondiv.append($saves);
              $formgroup.append($buttondiv);
              // $formgroup.append($saves);
            } else if (_.has(property.valueConstraint, 'useValuesFrom')) {
              // Let's supress the lookup unless it is in a modal for now.
              if (rt.embedType != 'modal' && forEachFirst && property.propertyLabel.match(/lookup/i)) {
                forEachFirst = false;
                return;
              }

              var $inputdiv = $('<div class="col-sm-8"></div>');
              $input = $('<input type="text" class="typeahead form-control" data-propertyguid="' + property.guid + '" id="' + property.guid + '" tabindex="' + tabIndices++ + '">');
              var $input_page = $('<input type="hidden" id="' + property.guid + '_page" class="typeaheadpage" value="1">');

              $inputdiv.append($input);
              $inputdiv.append($input_page);

              $input.on('focus', function () {
                if ($(this).val() === '') // you can also check for minLength
                { $(this).data().ttTypeahead.input.trigger('queryChanged', ''); }
              });

              $formgroup.append($label);
              $inputdiv.append($saves);
              $formgroup.append($inputdiv);

              if (rt.embedType == 'modal' && forEachFirst && property.propertyLabel.match(/lookup/i)) {
                // This is the first propertty *and* it is a look up.
                // Let's treat it special-like.
                var $saveLookup = $('<div class="modal-header" style="text-align: right;"><button type="button" class="btn btn-primary" id="bfeditor-modalSaveLookup-' + fobject.id + '" tabindex="' + tabIndices++ + '">Save changes</button></div>');
                var $spacer = $('<div class="modal-header" style="text-align: center;"><h2>OR</h2></div>');
                //$saveLookup.append($('<button id="bfeditor-modalLoadLookup" type="button" class="btn btn-primary" id="bfeditor-modalLoadLookup-' + fobject.id + '" tabindex="' + tabIndices++ + '">Load</button>'));
                $formgroup.append($saveLookup);
                $formgroup.append($spacer);
              }
            } else {
              // Type is resource, so should be a URI, but there is
              // no "value template reference" or "use values from vocabularies"
              // reference for it so just create label field
              $input = $('<div class="col-sm-8"><input class="form-control" id="' + property.guid + '" placeholder="' + property.propertyLabel + '" tabindex="' + tabIndices++ + '"></div>');

              $button = $('<div class="col-sm-1"><button type="button" class="btn btn-default" tabindex="' + tabIndices++ + '">Set</button></div>');
              $button.click(function () {
                setResourceFromLabel(fobject.id, rt.useguid, property.guid);
              });

              $formgroup.append($label);
              $input.append($saves);
              $formgroup.append($input);
              $formgroup.append($button);
              // $formgroup.append($saves);
            }
          } else {
            // Type is resource, so should be a URI, but there is
            // no constraint for it so just create a label field.
            $input = $('<div class="col-sm-8"><input class="form-control" id="' + property.guid + '" placeholder="' + property.propertyLabel + '" tabindex="' + tabIndices++ + '"></div>');

            $button = $('<div class="col-sm-1"><button type="button" class="btn btn-default" tabindex="' + tabIndices++ + '">Set</button></div>');
            $button.click(function () {
              setResourceFromLabel(fobject.id, rt.useguid, property.guid);
            });

            $formgroup.append($label);
            $input.append($saves);
            $formgroup.append($input);
            $formgroup.append($button);
            // $formgroup.append($saves);
          }
        }

        $resourcediv.append($formgroup);
        forEachFirst = false;
      });

      // starting the "add property" stuff here
      if (rt.embedType == 'page' && bfeusertemplates.getEditMode() !== true) {
        var substringMatcher = function (strs) {
          return function findMatches(q, cb) {
            strs = _.sortBy(strs, 'display');
            var matches, substrRegex;
            matches = [];
            substrRegex = new RegExp(q, 'i');
            $.each(strs, function (index, str) {
              if (substrRegex.test(str.display) && !addPropsUsed[str.uri]) {
                matches.push({
                  'value': str.display,
                  'label': str.label,
                  'uri': str.uri
                });
              }
            });
            cb(matches);
          };
        };
        var $addpropdata = $('<div>', { class: 'col-sm-8' });
        var $addpropinput = $('<input>', { id: 'addproperty', type: 'text', class: 'form-control add-property-input', placeholder: 'Type for suggestions' });
        $addpropinput.click(function () {
          if (addFields.length == 0) {
            $addpropinput.prop('disabled', true);
            $addpropinput.attr('placeholder', 'Loading field choices...');
            $.ajax({
              url: config.url + '/verso/api/configs?filter[where][configType]=ontology',
              success: function (data) {
                if (data.length == 0) {
                  $addpropinput.attr('placeholder', 'No ontologies defined...');
                }
                data.forEach(function (ont) {
                  ont.json.url = ont.json.url.replace(/\.rdf$/, '.json');
                  $.ajax({
                    dataType: 'json',
                    url: config.url + '/profile-edit/server/whichrt?uri=' + ont.json.url,
                    success: function (ontdata) {
                      ontdata.forEach(function (o) {
                        var prop = o['@type'][0].match(/property$/i);
                        if (prop && o['http://www.w3.org/2000/01/rdf-schema#label'] !== undefined && o['http://www.w3.org/2000/01/rdf-schema#label'][0]['@value']) {
                          var label = o['http://www.w3.org/2000/01/rdf-schema#label'][0]['@value'];
                          label = label.replace(/\s+/g, ' ');
                          var uri = o['@id'];
                          addFields.push({
                            'label': label,
                            'uri': uri,
                            'display': label + ' (' + ont.json.label + ')'
                          });
                        }
                      });
                    },
                    error: function (err) {
                      bfelog.addMsg(new Error(), 'INFO', err);
                    },
                    complete: function () {
                      $addpropinput.prop('disabled', false);
                      $addpropinput.attr('placeholder', 'Type for suggestions');
                      $addpropinput.focus();
                    }
                  });
                });
              },
              error: function (err) {
                bfelog.addMsg(new Error(), 'INFO', err);
              },
            });
          }
        });

        $addpropinput.appendTo($addpropdata).typeahead(
          {
            highlight: true,
          },
          {
            name: 'resources',
            displayKey: 'value',
            source: substringMatcher(addFields),
          }
        ).on('typeahead:selected', function (e, suggestion) {
          var newproperty = {
            'mandatory': 'false',
            'repeatable': 'true',
            'type': 'literal',
            'resourceTemplates': [],
            'valueConstraint': {
              'valueTemplateRefs': [],
              'useValuesFrom': [],
              'valueDataType': {}
            },
            'propertyLabel': suggestion.label,
            'propertyURI': suggestion.uri,
            'display': 'true',
            'guid': guid()
          };
          rt.propertyTemplates.push(newproperty);
          addedProperties.push(newproperty);
          cbLoadTemplates(rt.propertyTemplates);
        });
        var $addproplabel = $('<label class="col-sm-2 control-label">Add Property</label>');
        var $addprop = $('<div>', { class: 'form-group row' });
        $addprop.append($addproplabel);
        $addprop.append($addpropdata);
        $resourcediv.append($addprop);
      }
      form.append($resourcediv);
    });

    // OK now we need to populate the form with data, if appropriate.
    fobject.resourceTemplates.forEach(function (rt) {
      // check for match...maybe do this earlier

      if (_.where(bfestore.store, {
        'o': rt.resourceURI
      }).length > 0) {
        //		if(_.where(bfestore.store,{"o":rt.resourceURI}).length > 1) {
        if (bfestore.state !== 'edit') {
          _.where(bfestore.store, {
            'o': rt.resourceURI
          }).forEach(function (triple) {
            if (_.where(bfestore.store, {
              'o': triple.s
            }).length === 0) {
              bfelog.addMsg(new Error(), 'INFO', triple.s);
              rt.defaulturi = triple.s;
            }
          });
        } else {
          _.where(bfestore.store, {
            's': rt.defaulturi,
            'o': rt.resourceURI
          }).forEach(function (triple) {
            if (_.where(bfestore.store, {
              'o': triple.s
            }).length === 0) {
              bfelog.addMsg(new Error(), 'INFO', triple.s);
              rt.defaulturi = triple.s;
            }
          });
        }
        //		} else {
        //                rt.defaulturi =  _.where(bfestore.store,{"o":rt.resourceURI})[0].s;
        //		}
      }
      var triple = {};
      if (bfestore.state !== 'create' && rt.data.length === 0 && _.where(bfestore.store, {
        's': rt.defaulturi,
        'o': rt.resourceURI
      }).length === 0) {
        // Assume a fresh form, no pre-loaded data.
        //var id = guid();
        // var uri;
        // var uri = editorconfig.baseURI + rt.useguid;
        if (rt.defaulturi !== undefined && rt.defaulturi !== '') {
          fobject.defaulturi = rt.defaulturi;
        } else {
          fobject.defaulturi = editorconfig.baseURI + rt.useguid;
        }

        if (bfestore.state === 'edit' && _.some(bfestore.store, { 'p': 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type', 'o': rt.resourceURI })) {
          // match the rt to the type triple
          triple = _.find(bfestore.store, { 'p': 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type', 'o': rt.resourceURI });
          rt.defaulturi = triple.o;
          rt.guid = triple.guid;
          triple.rtID = rt.id;
        } else {
          triple = {};
          triple.guid = rt.useguid;
          triple.rtID = rt.id;
          triple.s = fobject.defaulturi;
          triple.p = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
          triple.o = rt.resourceURI;
          triple.otype = 'uri';
          fobject.store.push(triple);

          bfestore.addTriple(triple);
          // bfestore.store.push(triple);
          rt.guid = rt.useguid;
        }
        rt.propertyTemplates.forEach(function (property) {
          if (_.has(property, 'valueConstraint')) {
            if (_.has(property.valueConstraint, 'valueTemplateRefs') && !_.isEmpty(property.valueConstraint.valueTemplateRefs)) {
              var vtRefs = property.valueConstraint.valueTemplateRefs;
              for (var v = 0; v < vtRefs.length; v++) {
                var vtrs = vtRefs[v];
                if (fobject.resourceTemplateIDs.indexOf(vtrs) > -1 && vtrs != rt.id) {
                  var relatedTemplates = _.where(bfestore.store, {
                    rtID: vtrs
                  });
                  triple = {};
                  triple.guid = shortUUID(guid());
                  triple.s = fobject.defaulturi; //uri
                  triple.p = property.propertyURI;
                  triple.o = relatedTemplates[0].s;
                  triple.otype = 'uri';
                  fobject.store.push(triple);
                  bfestore.addTriple(triple);
                  property.display = 'false';
                }
              }
            }
          }
        });
      } else {
        fobject.defaulturi = rt.defaulturi;
        // the rt needs a type
        if (bfestore.state === 'create') {
          triple = {};
          triple.guid = rt.useguid;
          triple.rtID = rt.id;
          triple.s = rt.defaulturi;
          triple.p = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
          triple.o = rt.resourceURI;
          triple.otype = 'uri';
          fobject.store.push(triple);
          
          //console.log('4');
          bfestore.addTriple(triple);
          rt.guid = rt.useguid;
        }

        // This will likely be insufficient - we'll need the entire
        // pre-loaded store in this 'first' form.
        rt.data.forEach(function (t) {
          var triple = {};
          triple = t;
          if (triple.guid === undefined) {
            triple.guid = shortUUID(guid());
          }
          fobject.store.push(triple);
        });
      }

      // Populate form with pre-loaded data.
      bfelog.addMsg(new Error(), 'DEBUG', 'Populating form with pre-loaded data, if any');
      rt.propertyTemplates.forEach(function (property) {
        preloadData(property, rt, form, fobject);
      });
    });

    forms.push(fobject);

    bfelog.addMsg(new Error(), 'DEBUG', 'Newly created formobject.', fobject);
    

    return {
      formobject: fobject,
      form: form
    };
  }

  function preloadData(property, rt, form, fobject) {

    var propsdata = _.where(bfestore.store, {
      's': rt.defaulturi,
      'p': property.propertyURI
    }); 

    if (propsdata.length > 0) {
      // find the right one
      if (property.valueConstraint.valueTemplateRefs[0] !== undefined) {
        var parent = _.find(profiles, function (post) {
          for (var i = 0; i < property.valueConstraint.valueTemplateRefs.length; i++) {
            if (_.some(post.Profile.resourceTemplates, { id: property.valueConstraint.valueTemplateRefs[i] }))
            //                            return _.find(post.Profile.resourceTemplates, {id: property.valueConstraint.valueTemplateRefs[i]})
            { return post; }
          }
        });

        if (parent !== undefined) {
          
          var parent_nodes = [];
          var i = 0;
          do {
            if (_.some(parent.Profile.resourceTemplates, { id: property.valueConstraint.valueTemplateRefs[i] })) {
              var node_uri = _.find(parent.Profile.resourceTemplates, { id: property.valueConstraint.valueTemplateRefs[i] }).resourceURI;
              if (_.some(bfestore.store, { o: node_uri })) {
                parent_nodes.push(_.find(bfestore.store, { o: node_uri }));
              }
            }
            i++;
          } while (parent_nodes === undefined || i < property.valueConstraint.valueTemplateRefs.length);

          if (!_.isEmpty(parent_nodes)){
            for (i in propsdata){
              bfelog.addMsg(new Error(), 'DEBUG', 'Matching ' + propsdata[i].o);
              if(!propsdata[i].o.startsWith('_:bnode') && !_.some(bfestore.store, {'s':propsdata[i].o})){
                //add type triple
                var triple = {};
                triple.s = propsdata[i].o;
                triple.p = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
                triple.o = parent_nodes[0].o;
                triple.otype = 'uri';
                triple.guid = propsdata[i].guid;
                bfestore.addTriple(triple);
        
                //add label
                bfelog.addMsg(new Error(), 'DEBUG', 'whichLabel from: ' + propsdata[i].o);
                whichLabel(propsdata[i].o, null, function (label) {
                  var labeltriple = {}
                  labeltriple.s = propsdata[i].o;
                  labeltriple.p = 'http://www.w3.org/2000/01/rdf-schema#label';
                  labeltriple.o = label;
                  labeltriple.otype = 'literal';
                  labeltriple.guid = propsdata[i].guid;
                  bfestore.addTriple(labeltriple);
                });
              }
            }
          }

          var tempprops = [];
          if (!_.isEmpty(parent_nodes)) {
            for (var j = 0; j < parent_nodes.length; j++) {
              // we only want the properties that have the subject which matches the parent node's characteristics
              var bnodes = _.where(bfestore.store, { p: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type', o: parent_nodes[j].o });

              for (var k = 0; k < propsdata.length; k++) {
                if (_.some(bnodes, { s: propsdata[k].o })) {
                  tempprops.push(propsdata[k]);
                }
              }
            }
            propsdata = tempprops;
          } else if (bfestore.state === 'loaduri' && propsdata[0].o.startsWith('http://id.loc.gov/resources/works')) {
            // try with id.loc.gov
            triple = {};
            triple.s = propsdata[0].s;
            triple.p = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
            triple.o = 'http://id.loc.gov/ontologies/bibframe/Work';
            triple.otype = 'uri';
            triple.guid = shortUUID(guid());

            bfestore.addTriple(triple);
            tempprops = [];
            tempprops.push(triple);
            propsdata = tempprops;
          } else {
            // skip this one
            propsdata = [];
          }
        }
      }
    }

    if (propsdata[0] === undefined) {
      // log the resulttry again
      // console.log(property.propertyURI + ' not matched.');
    }
    if (propsdata[0] !== undefined) {
      // If this property exists for this resource in the pre-loaded data
      // then we need to make it appear.
      bfelog.addMsg(new Error(), 'DEBUG', 'Found pre-loaded data for ' + property.propertyURI);

      if (fobject.resourceTemplates[0].defaulturi.startsWith('_:bnode')) {
        if (_.some(propsdata, { 's': fobject.resourceTemplates[0].defaulturi })) {
          propsdata.forEach(function (pd) {
            loadPropsdata(pd, property, form, fobject);
          });
        } else {
          bfelog.addMsg(new Error(), 'INFO', 'bnode not matched');
        }
      } else {
        propsdata.forEach(function (pd) {
          loadPropsdata(pd, property, form, fobject);
        });
      }
    } else if (_.has(property, 'valueConstraint')) {

      // we need to convert defaults from the old "defaults" model to the new.
      if (!_.has(property.valueConstraint, 'defaults')) {
        property.valueConstraint.defaults = [];
        var defaultsObj = {};
        if (!_.isEmpty(property.valueConstraint.defaultURI)) {
          defaultsObj.defaultURI = property.valueConstraint.defaultURI;
        }
        if (!_.isEmpty(property.valueConstraint.defaultLiteral)) {
          defaultsObj.defaultLiteral = property.valueConstraint.defaultLiteral;
        }
        if (!_.isEmpty(defaultsObj)) {
          property.valueConstraint.defaults.push(defaultsObj);
        }
      }

      // Otherwise - if the property is not found in the pre-loaded data
      // then do we have a default value?

      for (var d = 0; d < property.valueConstraint.defaults.length; d++) {
        if (!_.isEmpty(property.valueConstraint.defaults[d].defaultURI) || !_.isEmpty(property.valueConstraint.defaults[d].defaultLiteral)) {
          var data;
          var label;
          var displayguid;
          if (property.type.indexOf('literal') > -1) {
            //the default is the literal
            var literalTriple = {};
            literalTriple.guid = shortUUID(guid());
            if (rt.defaulturi !== undefined && rt.defaulturi !== '') {
              literalTriple.s = rt.defaulturi;
            } else {
              literalTriple.s = editorconfig.baseURI + rt.useguid;
            }
            literalTriple.p = property.propertyURI;
            literalTriple.o = property.valueConstraint.defaults[d].defaultLiteral;
            literalTriple.otype = 'literal';
            label = literalTriple;
            displayguid = literalTriple.guid;
            fobject.store.push(literalTriple);
            bfestore.addTriple(literalTriple);

          } else if (_.has(property.valueConstraint.defaults[d], 'defaultURI') && !_.isEmpty(property.valueConstraint.defaults[d].defaultURI)) {
            data = property.valueConstraint.defaults[d].defaultURI;
            bfelog.addMsg(new Error(), 'DEBUG', 'Setting default data for ' + property.propertyURI);
            var triples = [];
            // is there a type?
            if (_.has(property.valueConstraint.valueDataType, 'dataTypeURI')) {
              var typeTriple = {};              
              typeTriple.guid = shortUUID(guid());
              typeTriple.s = data;
              typeTriple.p = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'; // rdf:type
              typeTriple.o = property.valueConstraint.valueDataType.dataTypeURI;
              typeTriple.otype = 'uri';
              fobject.store.push(typeTriple);
              bfestore.addTriple(typeTriple);
              triples.push(typeTriple)
            }

            // set the triples
            triple = {};
            triple.guid = shortUUID(guid());
            if (rt.defaulturi !== undefined && rt.defaulturi !== '') {
              triple.s = rt.defaulturi;
            } else {
              triple.s = editorconfig.baseURI + shortUUID(rt.useguid);
            }
            triple.p = property.propertyURI;
            triple.o = data;
            triple.otype = 'uri';
            fobject.store.push(triple);
            bfestore.addTriple(triple);
            triples.push(triple);

            // set the label
            label = {};
            label.guid = shortUUID(guid());
            if (triple) {
              label.s = triple.o;
            } else {
              label.s = rt.defaulturi;
            }
            displayguid = label.guid;
            label.otype = 'literal';
            label.p = 'http://www.w3.org/2000/01/rdf-schema#label';
            label.o = property.valueConstraint.defaults[d].defaultLiteral;
            fobject.store.push(label);
            bfestore.addTriple(label);
            triples.push(label);
          }

          // set the form
          var $formgroup = $('#' + property.guid, form).closest('.form-group');
          var $save = $formgroup.find('.btn-toolbar').eq(0);

          var displaydata = '';
          if (_.has(property.valueConstraint.defaults[d], 'defaultLiteral')) {
            displaydata = property.valueConstraint.defaults[d].defaultLiteral;
          }
          // displaydata = display;
          var editable = true;
          if (property.valueConstraint.editable !== undefined && property.valueConstraint.editable === 'false') {
            editable = false;
          }
          var bgvars = {
            'tguid': displayguid,
            'tlabelhover': displaydata,
            'tlabel': displaydata,
            'fobjectid': fobject.id,
            'inputid': property.guid,
            'editable': editable,
            'triples': triples
          };
          var $buttongroup = editDeleteButtonGroup(bgvars);
          $save.append($buttongroup);

          if (property.repeatable === 'false' || property.valueConstraint.repeatable == 'false') {
            var $el = $('#' + property.guid, form);
            if ($el.is('input')) {
              $el.prop('disabled', true);
            } else {
              // console.log(property.propertyLabel);
              var $buttons = $('div.btn-group-md', $el).find('button');
              $buttons.each(function () {
                $(this).prop('disabled', true);
              });
            }
          }
        }
      }
    }
  }

  function loadPropsdata(pd, property, form, fobject) {
    var $formgroup = $('#' + property.guid, form).closest('.form-group');
    var $save = $formgroup.find('.btn-toolbar').eq(0);
    // console.log(formgroup);
    var displaydata = '';
    var triples = [];
    // console.log("pd.otype is " + pd.otype);
    var hasTemplate = true;

    if (_.find(bfestore.store, {
      s: pd.o,
      p: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
    })) {
      var propsTemplateIds = _.where(resourceTemplates, {
        resourceURI: _.find(bfestore.store, {
          s: pd.o,
          p: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
        }).o
      });
    }

    if (propsTemplateIds !== undefined && !_.isEmpty(propsTemplateIds) && bfestore.state !== 'edit') {
      // if (_.indexOf(property.valueConstraint.valueTemplateRefs, propsTemplateId) < 0)
      var found = false;
      property.valueConstraint.valueTemplateRefs.forEach(function (valueTemplateId) {
        if (_.some(propsTemplateIds, {
          id: valueTemplateId
        })) {
          bfelog.addMsg(new Error(), 'INFO', property.propertyLabel + ' accepts ' + valueTemplateId);
          found = true;
        }
      });
      if (!found) {
        bfelog.addMsg(new Error(), 'INFO', property.propertyLabel + ' did not match' + pd.o);
        hasTemplate = false;
      }
    }

    if (pd.otype == 'uri' || pd.otype == 'list' && hasTemplate) {
      // _.find(resourceTemplates, {resourceURI: _.find(bfestore.store, {s:pd.o, p:"http://www.w3.org/1999/02/22-rdf-syntax-ns#type"}).o}).id

      triples = _.where(bfestore.store, {
        's': pd.o
      });
      // displaydata = pd.o;
      // console.log("displaydata is " + displaydata);
      var rtype = '';
      //var rparent = '';
      // var fparent = fobject.resourceTemplates[0].defaulturi;
      if (triples.length > 0) {
        triples.forEach(function (t) {
          if (rtype === '' && t.p === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type') {
            rtype = t.o;
            //rparent = t.s;
          }
          // if "type" matches a resourceTemplate.resourceURI && one of the property.valueConstraint.templates equals that resource template id....
          var triplesResourceTemplateID = '';
          if (rtype !== '') {
            if (_.has(property, 'valueConstraint')) {
              if (_.has(property.valueConstraint, 'valueTemplateRefs') && !_.isEmpty(property.valueConstraint.valueTemplateRefs)) {
                if (!_.some(resourceTemplates, {'resourceURI': rtype})){
                  //try finding a different type to match
                  var rtypes = _.where(bfestore.store, {"s": t.s, "p":"http://www.w3.org/1999/02/22-rdf-syntax-ns#type"});
                  for (var i=0;i<rtypes.length;i++){
                    if (rtypes[i].o !== rtype){
                      rtype = rtypes[i].o;
                    }
                  }
                }

                var resourceTs = _.where(resourceTemplates, {
                  'resourceURI': rtype
                });  

                resourceTs.forEach(function (r) {
                  // console.log("Looking for a match with " + r.id);
                  if (triplesResourceTemplateID === '' && _.indexOf(property.valueConstraint.valueTemplateRefs, r.id) !== -1) {
                    bfelog.addMsg(new Error(), 'DEBUG', 'Assocating one resource with another from loaded templates');
                    // console.log("Found a match in");
                    // console.log(property.valueConstraint.valueTemplateRefs);
                    // console.log("Associating " + r.id);
                    triplesResourceTemplateID = r.id;
                    t.rtID = r.id;
                  }
                });
              }
            }
          }
          fobject.store.push(t);
        });
        //label
        displaydata = exports.labelMaker(pd, property);
      }

      if (displaydata === undefined) {
        if (data !== undefined && data.o !== undefined) {
          displaydata = data.o;
        } else {
          //empty template
          hasTemplate = false;
          //displaydata = pd.o;
        }
      } else if (displaydata === '') {
        var labeldata = _.where(bfestore.store, {
          's': pd.o
        });
        
        var data = _.where(labeldata, {
          'otype': 'literal'
        });
        if (data.length > 0) {
          for (var i = 0; i < data.length; i++) {
            displaydata += data[i].o + ' ';
          }
        }
      } else {
        if (_.isArray(displaydata)) {
          _.first(displaydata).trim()
        } else {
          displaydata.trim();
        }
      }
    } else if (hasTemplate) {
      displaydata = pd.o;
    }

    //        if (displaydata == "") {
    //            displaydata = pd.s;
    //        }

    triples.push(pd);

    if (hasTemplate) {
      var bgvars = {
        'tguid': pd.guid,
        'tlabelhover': displaydata,
        'tlabel': displaydata,
        'fobjectid': fobject.id,
        'inputid': property.guid,
        'editable': property.valueConstraint.editable,
        'triples': triples
      };
      var $buttongroup = editDeleteButtonGroup(bgvars);

      $save.append($buttongroup);
      if (property.repeatable === 'false' || property.valueConstraint.repeatable == 'false') {
        var $el = $('#' + property.guid, form);
        if ($el.is('input')) {
          $el.prop('disabled', true);
        } else {
          // console.log(property.propertyLabel);
          var $buttons = $('div.btn-group-md', $el).find('button');
          $buttons.each(function () {
            $(this).prop('disabled', true);
          });
        }
      }
    }
  }

  exports.labelMaker = function (pd, property){
    var displaydata;

    var labeldata = _.where(bfestore.store, {
      's': pd.o
    });

    var parent = _.find(bfestore.store, {'o': pd.o});
    var parentLabel = _.find(bfestore.store, {'s': parent.s, 'p':'http://www.w3.org/2000/01/rdf-schema#label'});

    if (labeldata.length === 1) {
      var tpreflabel;
      var t = labeldata[0];
      if (t.otype === 'uri' || pd.otype == 'list') {
        var tsearch = t.o;
        if (t.p === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type') {
          tsearch = t.s;
        }
        if (!tsearch.startsWith('_:b')) {
          bfelog.addMsg(new Error(), 'DEBUG', 'whichLabel from: ' + tsearch);
          whichLabel(tsearch, null, function (label) {
            tpreflabel = label;
          });
        }
        displaydata = tpreflabel;
      } else {
        displaydata = t.o;
      }
    } else {
      var tauthlabel = _.find(labeldata, {
        p: 'http://www.loc.gov/mads/rdf/v1#authoritativeLabel'
      });
      var tlabel = _.find(labeldata, {
        p: 'http://www.w3.org/2000/01/rdf-schema#label'
      });
      var tvalue = _.find(labeldata, {
        p: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#value'
      });
      var tmainTitle = _.find(labeldata, {
        p: 'http://id.loc.gov/ontologies/bibframe/mainTitle'
      });
      
      var titleSortKey = _.find(labeldata, {
        p: 'http://id.loc.gov/ontologies/bflc/titleSortKey'
      });

      if (!_.isEmpty(tpreflabel)) {
        displaydata = tpreflabel;
      } else if (!_.isEmpty(tauthlabel)) {
        displaydata = tauthlabel.o;
      } else if (!_.isEmpty(tmainTitle)) {
        if (!_.isEmpty(titleSortKey))
          titleSortKey.o = tmainTitle.o;

        if (!_.isEmpty(parentLabel))
          parentLabel.o = tmainTitle.o;

        if (!_.isEmpty(tlabel)){
          tlabel.o = tmainTitle.o;
          displaydata = tmainTitle.o;
        } else {
          //create a new label
          displaydata = tmainTitle.o;
        }
      } else if (!_.isEmpty(tlabel)) {
        displaydata = tlabel.o;
      } else if (!_.isEmpty(tvalue)) {
        if (tvalue.o.startsWith('http')) {
          bfelog.addMsg(new Error(), 'DEBUG', 'whichLabel from: ' + tvalue.o);
          whichLabel(tvalue.o, null, function (label) {
            displaydata = label;
          });
        } else {
          var qualifier = _.find(labeldata, {
            s: tvalue.s,
            p: 'http://id.loc.gov/ontologies/bibframe/qualifier'
          });
          if (!_.isEmpty(qualifier) && !_.isEmpty(qualifier.o)) {
            displaydata = tvalue.o + ' ' + qualifier.o;
          } else {
            displaydata = tvalue.o;
          }
        }
      } else {
        displaydata = _.last(property.propertyURI.split('/'));
        //instance and works
        if (displaydata === 'instanceOf' || displaydata === 'hasInstance'){
          var titledata = _.where(bfestore.store, {
            's': pd.o,
            'p': 'http://id.loc.gov/ontologies/bibframe/title'
          });
          if (!_.isEmpty(titledata)){
            _.each(titledata, function(title){
              if(_.some(bfestore.store, {s: title.o, o: 'http://id.loc.gov/ontologies/bibframe/Title'}))
              {
                displaydata = _.find(bfestore.store, {s: title.o, p: 'http://id.loc.gov/ontologies/bibframe/mainTitle'}).o
              }
            });
          }
        } else {
          displaydata = exports.displayDataService(labeldata, displaydata)
        }
      }

      /*if (displaydata === undefined || _.isEmpty(displaydata)) {
        tlabel = _.find(_.where(bfestore.store, {
          's': labeldata[0].o
        }), {
            p: 'http://www.w3.org/2000/01/rdf-schema#label'
          });
        tvalue = _.find(_.where(bfestore.store, {
          's': labeldata[0].o
        }), {
            p: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#value'
          });
        tmainTitle = _.find(_.where(bfestore.store, {
          's': labeldata[0].o
        }), {
            p: 'http://id.loc.gov/ontologies/bibframe/mainTitle'
          });
        if (!_.isEmpty(tlabel)) {
          displaydata = tlabel.o;
        } else if (!_.isEmpty(tmainTitle)) {
          displaydata = tmainTitle.o;
        } else if (!_.isEmpty(tvalue)) {
          displaydata = tvalue.o;
        }
      }*/

      //list, target & note
      if (displaydata === _.last(property.propertyURI.split('/'))) {
        displaydata = displaydata+'+';
        var tsubject = labeldata[0].o;
        if (_.some(labeldata, {  p: "http://www.loc.gov/mads/rdf/v1#componentList" })) {
          var topics = _.where(labeldata, { p: "http://www.loc.gov/mads/rdf/v1#componentList" })
          var topicLabel;
          topics.forEach(function (t) {
            bfelog.addMsg(new Error(), 'DEBUG', 'whichLabel from: ' + t.o);
            whichLabel(t.o, null, function (label) {
              if (_.isEmpty(topicLabel)) {
                topicLabel = label;
              } else {
                topicLabel += '--' + label;
              }
            });
          });
          if(!_.isEmpty(tlabel)) {
            _.find(labeldata, {s: tlabel.s, p: "http://www.w3.org/2000/01/rdf-schema#label"}).o = topicLabel;
          } else {
            tlabel = {};
            tlabel.s = tsubject;
            tlabel.p = 'http://www.w3.org/2000/01/rdf-schema#label';
            tlabel.o = topicLabel;
            labeldata.push(tlabel);
          }
          displaydata = topicLabel;
          //update authoritativeLabel
          if (_.some(labeldata, { s: tlabel.s, p: "http://www.loc.gov/mads/rdf/v1#authoritativeLabel" })) {
            _.find(labeldata, { s: tlabel.s, p: "http://www.loc.gov/mads/rdf/v1#authoritativeLabel" }).o = topicLabel;
          }
        }
      }
    }
    return displaydata;

  }

  // callingformobjectid is as described
  // loadtemplate is the template objet to load.
  // resourceURI is the resourceURI to assign or to edit
  // inputID is the ID of hte DOM element within the loadtemplate form
  // triples is the base data.
  function openModal(callingformobjectid, loadtemplate, resourceURI, inputID, triples) {

    // Modals
    var modal = '<div class="modal fade" id="bfeditor-modal-modalID" tabindex="-1" role="dialog" aria-labelledby="myModalLabel" aria-hidden="true"> \
              <div class="modal-dialog modal-lg"> \
                  <div class="modal-content"> \
                      <div class="modal-header"> \
                          <button type="button" class="close" data-dismiss="modal" aria-hidden="true">&times;</button> \
                          <h4 class="modal-title" id="bfeditor-modaltitle-modalID">Modal title</h4> \
                      </div> \
                      <div class="modal-body" id="bfeditor-modalbody-modalID"></div> \
                      <div class="modal-footer"> \
                          <button type="button" class="btn btn-default" id="bfeditor-modalCancel-modalID" data-dismiss="modal">Cancel</button> \
                          <button type="button" class="btn btn-primary" id="bfeditor-modalSave-modalID">Save changes</button> \
                      </div> \
                  </div> \
              </div> \
          </div> ';

    bfelog.addMsg(new Error(), 'DEBUG', 'Opening modal for resourceURI ' + resourceURI);
    bfelog.addMsg(new Error(), 'DEBUG', 'inputID of DOM element / property when opening modal: ' + inputID);
    bfelog.addMsg(new Error(), 'DEBUG', 'callingformobjectid when opening modal: ' + callingformobjectid);

    var useguid = guid();
    var triplespassed = [];
    if (triples.length === 0) {
      // This is a fresh Modal, so we need to seed the data.
      // This happens when one is *not* editing data; it is fresh.
      var callingformobject = _.where(forms, {
        'id': callingformobjectid
      });
      callingformobject = callingformobject[0];
      callingformobject.resourceTemplates.forEach(function (t) {
        var properties = _.where(t.propertyTemplates, {
          'guid': inputID
        });
        if (!_.isEmpty(properties[0] )) {
          var triplepassed = {};
          triplepassed.guid = shortUUID(guid());
          triplepassed.s = t.defaulturi;
          triplepassed.p = properties[0].propertyURI; // instanceOF
          triplepassed.o = resourceURI;
          triplepassed.otype = 'uri';
          if (properties[0].type === 'list') {
            triplepassed.otype = properties[0].type;
            if (_.has(properties[0].valueConstraint.valueDataType, 'dataTypeURI')) {
              var typeTriple = {};              
              typeTriple.guid = shortUUID(guid());
              typeTriple.s = t.defaulturi;
              typeTriple.p = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'; // rdf:type
              typeTriple.o = properties[0].valueConstraint.valueDataType.dataTypeURI;
              typeTriple.otype = 'uri';
              triplespassed.push(typeTriple)
            }
          }
          triplespassed.push(triplepassed);

          triplepassed = {};
          triplepassed.guid = shortUUID(guid());
          triplepassed.s = resourceURI;
          triplepassed.rtID = loadtemplate.id;
          triplepassed.p = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'; // rdf:type
          triplepassed.o = loadtemplate.resourceURI;
          triplepassed.otype = 'uri';
          triplespassed.push(triplepassed);
        }
      });
    } else {
      // Just pass the triples on....
      triplespassed = triples;
    }
    bfelog.addMsg(new Error(), 'DEBUG', 'triplespassed within modal', triplespassed);
    var form = getForm([{
      templateGUID: useguid,
      resourceTemplateID: loadtemplate.id,
      resourceURI: resourceURI,
      embedType: 'modal',
      data: triplespassed
    }]);

    var m = $(modal.replace(/modalID/g, form.formobject.id));
    $(editordiv).append(m);

    $('#bfeditor-modalbody-' + form.formobject.id).append(form.form);
    $('#bfeditor-modaltitle-' + form.formobject.id).html(loadtemplate.resourceLabel);
    if (resourceURI.match(/^http/)) {
      var rid = resourceURI;
      var $resourceInfo = $('<a><span class="glyphicon glyphicon-info-sign"></span></a>');
      $resourceInfo.attr('data-content', rid);
      $resourceInfo.attr('data-toggle', 'popover');
      $resourceInfo.attr('title', 'Resource ID');
      $resourceInfo.attr('id', 'resource-id-popover');
      $resourceInfo.popover({ trigger: "click hover" });
      $('#bfeditor-modaltitle-' + form.formobject.id).append($resourceInfo);
    }   
    
    $('#bfeditor-form-' + form.formobject.id + ' > div > h3').remove();
    $('#bfeditor-modal-' + form.formobject.id).modal({backdrop: 'static'});
    $('#bfeditor-modal-' + form.formobject.id).modal('show');
    $('#bfeditor-modalCancel-' + form.formobject.id).attr('tabindex', tabIndices++);

    $('#bfeditor-modal-' + form.formobject.id).draggable({
      handle: ".modal-header"
    });

    $('#bfeditor-modalSave-' + form.formobject.id).click(function () {
      triples.forEach(function (triple) {
        removeTriple(callingformobjectid, inputID, null, triple);
      });
      if (form.formobject.store.length <= 2) {
        $('#bfeditor-modalSave-' + form.formobject.id).off('click');
        $('#bfeditor-modal-' + form.formobject.id).modal('hide');
      } else {
        // create label
        //		var triple = {
        //			"guid": guid(),
        //			"o": _.where(_.where(form.formobject.store, {"s": form.formobject.resourceTemplates[0].defaulturi}), {"p": "http://www.w3.org/1999/02/22-rdf-syntax-ns#type"})[0].o,
        //			"otype":"literal",
        //			"p": "http://www.w3.org/2000/01/rdf-schema#label",
        //			"s": _.where(form.formobject.store, {"p": "http://www.w3.org/2000/01/rdf-schema#label"})[0].o.trim()
        //			}

        //	        form.formobject.store.push(triple);

        // Kirk note, at this point, some resources have a URI and others have a blank node that matches the defaulturi.

        setResourceFromModal(callingformobjectid, form.formobject.id, resourceURI, form.formobject.defaulturi, inputID, _.uniq(form.formobject.store));
      }
    });
    $('#bfeditor-modalSave-' + form.formobject.id).attr('tabindex', tabIndices++);
    $('#bfeditor-modalSaveLookup-' + form.formobject.id).click(function () {
      triples.forEach(function (triple) {
        removeTriple(callingformobjectid, inputID, null, triple);
      });

      var data = form.formobject.store;

      setResourceFromModal(callingformobjectid, form.formobject.id, resourceURI, form.formobject.defaulturi, inputID, _.uniq(data));
    });
    $('#bfeditor-modal-' + form.formobject.id).on('hide.bs.modal', function () {
      $(this).empty();
    });

    $('.typeahead', form.form).each(function () {
      setTypeahead(this);
    });

    $('#bfeditor-debug').html(JSON.stringify(bfestore.store, undefined, ' '));
    $('#bfeditor-modal-' + form.formobject.id).on('shown.bs.modal', function () {
      $('input:visible:enabled:first', this).focus();
    });
  }

  function setResourceFromModal(formobjectID, modalformid, resourceID, resourceSubject, propertyguid, data) {
    /*
        console.log("Setting resource from modal");
        console.log("guid of has oether edition: " + forms[0].resourceTemplates[0].propertyTemplates[13].guid);
        console.log("formobjectID is: " + formobjectID);
        console.log("modal form id is: " + modalformid);
        console.log("propertyguid is: " + propertyguid);
        console.log(forms);
        console.log(callingformobject);
        console.log(data);
        */

    bfelog.addMsg(new Error(), 'DEBUG', 'Setting resource from modal');
    bfelog.addMsg(new Error(), 'DEBUG', 'modal form id is: ' + modalformid);
    var tsubject = resourceID;
    var callingformobject = _.where(forms, {
      'id': formobjectID
    });
    callingformobject = callingformobject[0];
    var resourcetemplate = _.find(_.find(forms, { 'id': modalformid }).resourceTemplates, { defaulturi: resourceID });

    // add the resourceType for the form
    var resourceType = {
      'guid': shortUUID(guid()),//propertyguid,
      's': resourceSubject,
      'otype': 'uri',
      'p': 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
      'o': resourcetemplate.resourceURI
    };

    resourceType.rtID = _.where(callingformobject.resourceTemplates[0].propertyTemplates, {
      'guid': propertyguid
    })[0].valueConstraint.valueTemplateRefs[0];

    if(_.some(data, {'p': "http://id.loc.gov/ontologies/bflc/target"})){
      //targets are converted to resources if they do not have additional properties
      var target = _.find(data, {'p': "http://id.loc.gov/ontologies/bflc/target"});
      //ignoring types, are there any other triples?
      var bnode = target.s;
      var bnodes = _.where(data, {s: bnode});
      var tcount = _.reject(bnodes, {p: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type"}).length;
      if (tcount === 1){
        //convert to resource
        data = _.reject(data, {s: bnode});
        _.find(data, {o: bnode}).o = target.o;
        resourceType.s = target.o;
      }
    }
    //if(!_.some(data, resourceType))
      data.push(resourceType);

    callingformobject.resourceTemplates.forEach(function (resourceTemplate) {
      var properties = _.where(resourceTemplate.propertyTemplates, {
        'guid': propertyguid
      });
      if (!_.isEmpty(properties[0])) {
        bfelog.addMsg(new Error(), 'DEBUG', 'Data from modal: ', data);

        var $formgroup = $('#' + propertyguid, callingformobject.form).closest('.form-group');
        var save = $formgroup.find('.btn-toolbar')[0];

        bfelog.addMsg(new Error(), 'DEBUG', 'Selected property from calling form: ' + properties[0].propertyURI);
        var display = exports.labelMakerModal(tsubject, data)

        data.forEach(function (triple) {
          callingformobject.store.push(triple);
          bfestore.addTriple(triple);
          // bfestore.store.push(t);
        });

        bfestore.storeDedup();

        var connector = _.where(data, {
          'p': properties[0].propertyURI
        });

        if(connector[0].p === 'http://id.loc.gov/ontologies/bibframe/title' && resourceTemplate.embedType === 'page' ){
          //lookup bf:Title only
          var title = _.find(bfestore.store, {
            's': connector[0].o,
            'o': 'http://id.loc.gov/ontologies/bibframe/Title'
          });
          //find bf:title/bf:Title/bf:mainTitle
          if (!_.isEmpty(title)) {
            var mainTitle = _.find(bfestore.store, {
              's': title.s,
              'p': 'http://id.loc.gov/ontologies/bibframe/mainTitle'
            });
            if (!_.isEmpty(mainTitle)) {
              display.displaydata = mainTitle.o;
              $('#resource-title>a').attr('data-original-title', mainTitle.o);
              $('#resource-title>a').attr('title', mainTitle.o);
              if(_.some(bfestore.store, {s: mainTitle.s, p: 'http://www.w3.org/2000/01/rdf-schema#label'})){
                _.find(bfestore.store, {s: mainTitle.s, p: 'http://www.w3.org/2000/01/rdf-schema#label'}).o = mainTitle.o;
              } else { 
                //add label triple
                var labelTriple = {};
                labelTriple.s = mainTitle.s;
                labelTriple.p = 'http://www.w3.org/2000/01/rdf-schema#label'
                labelTriple.o = mainTitle.o;
                labelTriple.guid = shortUUID(guid());
                labelTriple.otype = 'literal';
                bfestore.addTriple(labelTriple);
              }
            }
          }
        }
        var bgvars = {
          'tguid': connector[0].guid,
          'tlabelhover': display.displaydata,
          'tlabel': display.displaydata,
          'tlabelURI': display.displayuri,
          'fobjectid': formobjectID,
          'inputid': propertyguid,
          'editable': properties[0].valueConstraint.editable,
          'triples': data
        };
        var $buttongroup = editDeleteButtonGroup(bgvars);

        $(save).append($buttongroup);
        // $("#" + propertyguid, callingformobject.form).val("");
        if (properties[0].repeatable !== undefined && properties[0].repeatable == 'false') {
          //$('#' + propertyguid, callingformobject.form).attr('disabled', true);
          $('#' + propertyguid + ' div.btn-group-md button', callingformobject.form).attr('disabled', true);
        }
      }
    });
    // Remove the form?
    // forms = _.without(forms, _.findWhere(forms, {"id": formobjectID}));
    $('#bfeditor-modalSave-' + modalformid).off('click');
    $('#bfeditor-modal-' + modalformid).modal('hide');

    $('#bfeditor-debug').html(JSON.stringify(bfestore.store, undefined, ' '));
  }

  exports.labelMakerModal = function (tsubject, data) {

    var parent = _.find(data, {'o': tsubject});
    var parentLabel;
    if (!_.isEmpty(parent)){
      parentLabel = _.find(bfestore.store, {'s': parent.s, 'p':'http://www.w3.org/2000/01/rdf-schema#label'});
    }
    var tauthlabel = _.find(data, {
      s: tsubject,
      p: 'http://www.loc.gov/mads/rdf/v1#authoritativeLabel'
    });
    var tlabel = _.find(data, {
      s: tsubject,
      p: 'http://www.w3.org/2000/01/rdf-schema#label'
    });
    var tvalue = _.find(data, {
      s: tsubject,
      p: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#value'
    });
    var tmainTitle = _.find(data, {
      s: tsubject,
      p: 'http://id.loc.gov/ontologies/bibframe/mainTitle'
    });
    var titleSortKey = _.find(data, {
      s: tsubject,
      p: 'http://id.loc.gov/ontologies/bflc/titleSortKey'
    });

    //componentlist label
    if (_.some(data, { s: tsubject, p: "http://www.loc.gov/mads/rdf/v1#componentList" })) {
      var topics = _.where(data, { s: tsubject, p: "http://www.loc.gov/mads/rdf/v1#componentList" })
      var topicLabel;
      topics.forEach(function (t) {
        bfelog.addMsg(new Error(), 'DEBUG', 'whichLabel from: ' + t.o);
        whichLabel(t.o, data, function (label) {
          if (_.isEmpty(topicLabel)) {
            topicLabel = label;
          } else {
            topicLabel += '--' + label;
          }
        });
      });
      if(!_.isEmpty(tlabel)) {
        _.find(data, {s: tsubject, p: "http://www.w3.org/2000/01/rdf-schema#label"}).o = topicLabel;
      } else if(!_.some(data, {p: "http://www.w3.org/2000/01/rdf-schema#label", o: topicLabel})){
        tlabel = {};
        tlabel.guid = shortUUID(guid()),
        tlabel.otype = 'literal',
        tlabel.s = tsubject;
        tlabel.p = 'http://www.w3.org/2000/01/rdf-schema#label';
        tlabel.o = topicLabel;
        data.push(tlabel);
      }
      //update authoritativeLabel
      if (_.some(data, { s: tsubject, p: "http://www.loc.gov/mads/rdf/v1#authoritativeLabel" })) {
        _.find(data, { s: tsubject, p: "http://www.loc.gov/mads/rdf/v1#authoritativeLabel" }).o = topicLabel;
      }
    }
    // if there's a label, use it. Otherwise, create a label from the literals, and if no literals, use the uri.
    var displayuri = /[^/]*$/.exec(_.find(data, { p: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type' }).o)[0];
    var displaydata = '';
    if (!_.isEmpty(tauthlabel)) {
      displaydata = tauthlabel.o;
      displayuri = tauthlabel.s;
    } else if (!_.isEmpty(tmainTitle)) {
      if (!_.isEmpty(titleSortKey))
        titleSortKey.o = tmainTitle.o;
      if (!_.isEmpty(parentLabel))
        parentLabel.o = tmainTitle.o;
      if (!_.isEmpty(tlabel)) {
        tlabel.o = tmainTitle.o;
        displaydata = tmainTitle.o;
        displayuri = tmainTitle.s;
      } else {
        //create a new label
        displaydata = tmainTitle.o;
        displayuri = tmainTitle.s;
      }
    } else if (!_.isEmpty(tlabel)) {
      displaydata = tlabel.o;
      displayuri = tlabel.s;
    } else if (!_.isEmpty(tvalue)) {
      displaydata = tvalue.o;
      displayuri = tvalue.s;
    } else if (!_.isEmpty(parent)){
        displayuri = parent.o;
        var relationship = _.last(parent.p.split('/'));
        //instance and works
        if (relationship === 'instanceOf' || relationship === 'hasInstance'){
          var titledata = _.where(data, {
            's': displayuri,
            'p': 'http://id.loc.gov/ontologies/bibframe/title'
          });
          if (!_.isEmpty(titledata)){
            _.each(titledata, function(title){
              if(_.some(data, {s: title.o, o: 'http://id.loc.gov/ontologies/bibframe/Title'}))
              {
                displaydata = _.find(data, {s: title.o, p: 'http://id.loc.gov/ontologies/bibframe/mainTitle'}).o
              }
            });
          }
        } else {
          displaydata = exports.displayDataService(data, displaydata)
        }
    } else {
      displaydata = exports.displayDataService(data, displaydata)
    }
    
    return {
      displayuri: displayuri,
      displaydata: displaydata
    }
  }

  exports.displayDataService = function(labeldata, displaydata){
    if (displaydata === 'adminMetadata') {
      var admindisplaydata = '';

      if(_.some(labeldata, { p: 'http://id.loc.gov/ontologies/bflc/catalogerId' })){
        admindisplaydata = _.find(labeldata, { p: 'http://id.loc.gov/ontologies/bflc/catalogerId' }).o
      }
      
      if(_.some(labeldata, { p: 'http://id.loc.gov/ontologies/bflc/profile' })){
        admindisplaydata += ' ' + _.find(labeldata, { p: 'http://id.loc.gov/ontologies/bflc/profile' }).o
      } 
      
      if(_.some(labeldata, { p: 'http://id.loc.gov/ontologies/bibframe/changeDate' })){
        admindisplaydata += ' ' +_.find(labeldata, { p: 'http://id.loc.gov/ontologies/bibframe/changeDate' }).o
      }

      if (!_.isEmpty(admindisplaydata))
        displaydata = admindisplaydata;

    } else if (displaydata === 'contribution') {
      // lookup agent and role;
      var role = _.find(labeldata, {
        'p': 'http://id.loc.gov/ontologies/bibframe/role'
      });
      var agent = _.find(labeldata, {
        'p': 'http://id.loc.gov/ontologies/bibframe/agent'
      });

      if (!_.isEmpty(agent)) {
        if (agent.o.match(/#Agent/) || agent.o.startsWith('_:b')) {
          var agentLabel = _.find(bfestore.store, {
            's': agent.o,
            'p': 'http://www.w3.org/2000/01/rdf-schema#label'
          });

          if (!_.isEmpty(agentLabel)) {
            displaydata = agentLabel.o;
          }
        } else {
          // try looking up
          bfelog.addMsg(new Error(), 'DEBUG', 'whichLabel from: ' + agent.o);
          whichLabel(agent.o, null, function (label) {
            if (!_.isEmpty(label)) 
              { displaydata = label; }
          });
        }
      }
      if (!_.isEmpty(role)) {
        if (role.o.match(/#Role/) || role.o.startsWith('_:b')) {
          var roleLabel = _.find(bfestore.store, {
            's': role.o,
            'p': 'http://www.w3.org/2000/01/rdf-schema#label'
          });

          if (!_.isEmpty(roleLabel) && displaydata !== 'contribution') {
            if (displaydata.endsWith(','))
              displaydata = displaydata + ' ' + roleLabel.o;
            else
              displaydata = displaydata + ', ' + roleLabel.o; 
          }
        } else {
          bfelog.addMsg(new Error(), 'DEBUG', 'whichLabel from: ' + role.o);
          whichLabel(role.o, null, function (label) {
            if (!_.isEmpty(label) && displaydata !== 'contribution') 
              { if (displaydata.endsWith(','))
                  displaydata = displaydata + ' ' + label; 
                else
                  displaydata = displaydata + ', ' + label; 
              }
          });
        }
      }
    } else if (displaydata === 'hasItem') {
      displaydata = "Item";
      if(_.some(labeldata, {
        'p': 'http://id.loc.gov/ontologies/bibframe/identifiedBy'
      })) {
        _.each(_.where(labeldata, {
          'p': 'http://id.loc.gov/ontologies/bibframe/identifiedBy'
        }), function(id) {
            if(_.some(bfestore.store, {s: id.o, p: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type", o: 'http://id.loc.gov/ontologies/bibframe/ShelfMarkLcc' })){
              var shelfmarkdata = _.where(bfestore.store, {s: id.o});
              //look for literals and concatenate them
              var literallabel = '';
              _.each(_.where(shelfmarkdata, {otype: 'literal'}), function(label){
                if(label.p === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#value')
                  //switch to rdfs.label
                  label.p = 'http://www.w3.org/2000/01/rdf-schema#label';
                literallabel += label.o + ' ';
              });
              if (!_.isEmpty(literallabel)){
                //add enumeration
                if(_.some(labeldata, {p: "http://id.loc.gov/ontologies/bibframe/enumerationAndChronology"})){
                  literallabel += ' ' + _.find(bfestore.store,{s: _.find(labeldata, {p: "http://id.loc.gov/ontologies/bibframe/enumerationAndChronology"}).o, otype: 'literal'}).o
                }
                displaydata = literallabel.trim();
              }
            }
        })
      }
    } else if (displaydata === 'classification') {
      if (_.some(labeldata, {
        'p': 'http://id.loc.gov/ontologies/bibframe/classificationPortion'
      })) {
        displaydata = _.find(labeldata, {
          'p': 'http://id.loc.gov/ontologies/bibframe/classificationPortion'
        }).o;
      }
    } else if (displaydata === 'provisionActivity') {
      var place = _.find(labeldata, {
        'p': 'http://id.loc.gov/ontologies/bibframe/place'
      });
      if (!_.isEmpty(place)) {
        if (place.o.startsWith('_:b')) {
          var placeLabel = _.find(bfestore.store, {
            's': place.o,
            'p': 'http://www.w3.org/2000/01/rdf-schema#label'
          }).o;
        } else {
          bfelog.addMsg(new Error(), 'DEBUG', 'whichLabel from: ' + place.o);
          whichLabel(place.o, null, function (label) {
            placeLabel = label;
          });
        }
      }
      agent = _.find(labeldata, {
        'p': 'http://id.loc.gov/ontologies/bibframe/agent'
      });
      if (!_.isEmpty(agent)) {
        if (agent.o.startsWith('_:b')) {
          agentLabel = _.find(bfestore.store, {
            's': agent.o,
            'p': 'http://www.w3.org/2000/01/rdf-schema#label'
          }).o;
        } else if (agent.o.startsWith('//mlvlp06.loc.gov')) {
          var newagent = agent.o.replace(/\/\/mlvlp06.loc.gov:8288\/bfentities/, 'http://id.loc.gov/entities');
          
          _.each(_.where(bfestore.store, {
            's': agent.o,
          }), function (entity){
            entity.s = newagent;
          });
          
          agent.o = newagent;

          agentLabel = _.find(bfestore.store, {
            's': agent.o,
            'p': 'http://www.w3.org/2000/01/rdf-schema#label'
          }).o;

        } else {
          bfelog.addMsg(new Error(), 'DEBUG', 'whichLabel from: ' + agent.o);
          whichLabel(agent.o, null, function (label) {
            agentLabel = label;
          });
        }
      }

      var date = _.find(labeldata, {
        'p': 'http://id.loc.gov/ontologies/bibframe/date'
      });
      if (!_.isEmpty(date)) { 
        var dateLabel = date.o; 
      }

      if (!_.isEmpty(placeLabel) && !_.isEmpty(agentLabel) && !_.isEmpty(dateLabel)) {
        displaydata = placeLabel  + ': ' + agentLabel + ', ' + dateLabel;
      } else if (!_.isEmpty(placeLabel) && !_.isEmpty(agentLabel) && _.isEmpty(dateLabel)) {
        displaydata = placeLabel + ': ' + agentLabel;
      } else if (_.isEmpty(placeLabel) && !_.isEmpty(agentLabel) && !_.isEmpty(dateLabel)) {
        displaydata = agentLabel + ', ' + dateLabel;
      } else if (!_.isEmpty(placeLabel) && _.isEmpty(agentLabel) && !_.isEmpty(dateLabel)) {
        displaydata = placeLabel + ', ' + dateLabel;
      }
    } else if (displaydata === 'v1#componentList' || displaydata === 'genreForm') {
      displaydata = "";
      _.forEach(labeldata, function (triple) {
        bfelog.addMsg(new Error(), 'DEBUG', 'whichLabel from: ' + triple.s);
        whichLabel(triple.s, null, function (label) {
          displaydata = label;
        });
      });
    }  else if (_.some(labeldata, { p: "http://id.loc.gov/ontologies/bflc/target" })) {
      //target
      var targets = _.where(labeldata, { p: "http://id.loc.gov/ontologies/bflc/target" })
      targets.forEach(function (t) {
        bfelog.addMsg(new Error(), 'DEBUG', 'whichLabel from: ' + t.o);
        whichLabel(t.o, null, function (label) {
          displaydata = label;
        });
      });
    } else if (_.some(labeldata, { p: "http://id.loc.gov/ontologies/bibframe/note" })) {
      var notes = _.where(labeldata, { p: "http://id.loc.gov/ontologies/bibframe/note" })
      notes.forEach(function (n) {
        displaydata = displaydata + _.find(bfestore.store, {
          's': n.o,
          'p': 'http://www.w3.org/2000/01/rdf-schema#label'
        }).o;
      });
    } else {
      //look for literals and concatenate them
      var literallabel = '';
      _.each(_.where(labeldata, {otype: 'literal'}), function(label){
        literallabel += label.o + ' ';
      });
      if (!_.isEmpty(literallabel)){
        displaydata = literallabel.trim();
      }
    }

    return displaydata
  }

  function editDeleteButtonGroup(bgvars) {
    /*
            vars should be an object, structured thusly:
            {
                "tguid": triple.guid,
                "tlabel": tlabel | data
                "fobjectid": formobject.id
                "inputid": inputid,
                triples: []
            }
        */
    var display, $buttongroup = $('<div>', {
      id: bgvars.tguid,
      class: 'btn-group btn-group-xs'
    });
    if (!_.isUndefined(bgvars.tlabel)) {
      if (bgvars.tlabel.length > 60) {
        display = bgvars.tlabel.substr(0, 58) + '...';
      } else {
        display = bgvars.tlabel;
      }
    } else {
      display = 'example';
    }
    

    var $displaybutton = $('<button type="button" class="btn btn-default" title="' + bgvars.tlabelhover + '">' + display + '</button>');
    // check for non-blanknode
    if (bgvars.tlabelURI !== undefined && bgvars.tlabelURI.match('^!_:b')) {
      $displaybutton = $('<button type="button" class="btn btn-default" title="' + bgvars.tlabelhover + '"><a href="' + bgvars.tlabelURI + '">' + display + '</a></button>');
    }
    $buttongroup.append($displaybutton);

    if (bgvars.editable === undefined || bgvars.editable === "true" || bgvars.editable === true) {
      // var $editbutton = $('<button type="button" class="btn btn-warning">e</button>');
      var $editbutton = $('<button class="btn btn-warning" type="button"> <span class="glyphicon glyphicon-pencil"></span></button>');
      $editbutton.click(function () {
        if (bgvars.triples.length === 1) {
          editTriple(bgvars.fobjectid, bgvars.inputid, bgvars.triples[0]);
        } else {
          editTriples(bgvars.fobjectid, bgvars.inputid, bgvars.tguid, bgvars.triples);
        }
      });
      $buttongroup.append($editbutton);
    }
    var $delbutton = $('<button class="btn btn-danger" type="button"><span class="glyphicon glyphicon-trash"></span> </button>');
    //          var $delbutton = $('<button type="button" class="btn btn-danger">x</button>');
    $delbutton.click(function () {
      if (bgvars.triples.length === 1) {
        removeTriple(bgvars.fobjectid, bgvars.inputid, bgvars.tguid, bgvars.triples[0]);
      } else {
        removeTriples(bgvars.fobjectid, bgvars.inputid, bgvars.tguid, bgvars.triples);
      }
    });
    $buttongroup.append($delbutton);

    return $buttongroup;
  }

  function setRtLabel(formobjectID, resourceID, inputID, rt) {
    var formobject = _.where(forms, {
      'id': formobjectID
    });
    formobject = formobject[0];
    var data = $('#' + inputID).val();
    if (!_.isEmpty(data)) {
      var triple = {};
      triple.guid = shortUUID(guid());
      triple.s = rt.defaulturi;
      triple.p = 'http://www.w3.org/2000/01/rdf-schema#label';
      triple.o = data;
      triple.otype = 'literal';
      triple.olang = 'en';
      bfestore.addTriple(triple);
      formobject.store.push(triple);

      var formgroup = $('#' + inputID, formobject.form).closest('.form-group');
      var save = $(formgroup).find('.btn-toolbar')[0];
      var bgvars = {
        'tguid': triple.guid,
        'tlabel': data,
        'tlabelhover': data,
        'fobjectid': formobjectID,
        'inputid': inputID,
        'triples': [triple]
      };
      var $buttongroup = editDeleteButtonGroup(bgvars);
      $(save).append($buttongroup);
      $('#' + inputID).val('');
    }
    $('#bfeditor-debug').html(JSON.stringify(bfestore.store, undefined, ' '));
  }

  function setLiteral(formobjectID, resourceID, inputID) {
    var formobject = _.where(forms, {
      'id': formobjectID
    });
    formobject = formobject[0];
    // console.log(inputID);
    var data = $('#' + inputID, formobject.form).val();
    if (!_.isEmpty(data)) {
      
      // check if there there assoicated lang and script values for this input
      var lang = null;
      var script = null;
      if ($('#' + inputID + '-lang') && $('#' + inputID + '-script')){
        lang = $('#' + inputID + '-lang').val()
        script = $('#' + inputID + '-script').val();
        
        if (script != ''){
          lang = lang + '-' + script
        }
        
        if (lang==='undefined-undefined' || lang==='undefined'){
          lang = null;
        }
        
        
      }
    
      var triple = {};
      triple.guid = shortUUID(guid());
      formobject.resourceTemplates.forEach(function (t) {
        var properties = _.where(t.propertyTemplates, {
          'guid': inputID
        });
        triple.rtID = t.id;
        if (!_.isEmpty(properties[0] )) {
          if (!_.isEmpty(t.defaulturi)) {
            triple.s = t.defaulturi;
          } else {
            // triple.s = editorconfig.baseURI + resourceID;
            triple.s = t.resouceURI;
          }
          triple.p = properties[0].propertyURI;
          triple.o = data;
          triple.otype = 'literal';
          if (lang){
            triple.olang = lang;
          }
          // triple.olang = "";

          
          // bfestore.store.push(triple);
          bfestore.addTriple(triple);
          formobject.store.push(triple);

          var formgroup = $('#' + inputID, formobject.form).closest('.form-group');
          var save = $(formgroup).find('.btn-toolbar')[0];
          var buttonLabel = data;
          if (lang){
            buttonLabel = buttonLabel + '@' + lang
          }
          var bgvars = {
            'tguid': triple.guid,
            'tlabel': buttonLabel,
            'tlabelhover': buttonLabel,
            'fobjectid': formobjectID,
            'inputid': inputID,
            'triples': [triple]
          };
          var $buttongroup = editDeleteButtonGroup(bgvars);

          $(save).append($buttongroup);
          $('#' + inputID, formobject.form).val('');
          $('#' + inputID + '-lang').val('lang');
          $('#' + inputID + '-script').val('');
          if (properties[0].repeatable !== undefined && properties[0].repeatable == 'false') {
            $('#' + inputID, formobject.form).attr('disabled', true);
          }
        }
      });
    }
    $('#bfeditor-debug').html(JSON.stringify(bfestore.store, undefined, ' '));
  }

  function setResourceFromLabel(formobjectID, resourceID, inputID) {
    var formobject = _.where(forms, {
      'id': formobjectID
    });
    formobject = formobject[0];
    // console.log(inputID);
    var data = $('#' + inputID, formobject.form).val();
    if (!_.isEmpty(data)) {
      var triple = {};
      triple.guid = shortUUID(guid());
      formobject.resourceTemplates.forEach(function (t) {
        var properties = _.where(t.propertyTemplates, {
          'guid': inputID
        });
        triple.rtID = t.id;
        if (!_.isEmpty(properties[0] )) {
          if (!_.isEmpty(t.defaulturi )) {
            triple.s = t.defaulturi;
          } else {
            triple.s = editorconfig.baseURI + resourceID;
          }
          triple.p = properties[0].propertyURI;
          triple.o = data;
          triple.otype = 'uri';

          // bfestore.store.push(triple);
          bfestore.addTriple(triple);
          formobject.store.push(triple);

          var $formgroup = $('#' + inputID, formobject.form).closest('.form-group');
          var save = $formgroup.find('.btn-toolbar')[0];

          var bgvars = {
            'tguid': triple.guid,
            'tlabel': triple.o,
            'tlabelhover': triple.o,
            'fobjectid': formobjectID,
            'inputid': inputID,
            'triples': [triple]
          };
          var $buttongroup = editDeleteButtonGroup(bgvars);

          $(save).append($buttongroup);
          $('#' + inputID, formobject.form).val('');
          if (properties[0].repeatable !== undefined && properties[0].repeatable == 'false') {
            $('#' + inputID, formobject.form).attr('disabled', true);
          }
        }
      });
    }
    $('#bfeditor-debug').html(JSON.stringify(bfestore.store, undefined, ' '));
  }

  function setTypeahead(input) {
    var lcshared = require('src/lookups/lcshared');

    // var form = $(input).closest("form").eq(0);
    var formid = $(input).closest('form').eq(0).attr('id');
    var pageid = $(input).siblings('.typeaheadpage').attr('id');
    formid = formid.replace('bfeditor-form-', '');
    var formobject = _.where(forms, {
      'id': formid
    });
    formobject = formobject[0];
    if (typeof (pageid) !== 'undefined') {
      formobject.pageid = pageid;
    }
    // console.log(formid);

    var pguid = $(input).attr('data-propertyguid');
    var p;
    formobject.resourceTemplates.forEach(function (t) {
      var properties = _.where(t.propertyTemplates, {
        'guid': pguid
      });
      // console.log(properties);
      if (!_.isEmpty(properties[0] )) {
        p = properties[0];
      }
    });

    var uvfs = p.valueConstraint.useValuesFrom;
    var dshashes = [];
    uvfs.forEach(function (uvf) {
      // var lups = _.where(lookups, {"scheme": uvf});
      var lu = lookups[uvf];
      if (lu === undefined) {
        lu = buildLookup(uvf);
        lookups[uvf] = lu;
      }

      bfelog.addMsg(new Error(), 'DEBUG', 'Setting typeahead scheme: ' + uvf);
      bfelog.addMsg(new Error(), 'DEBUG', 'Lookup is', lu.name);

      var dshash = {};
      dshash.name = lu.name;
      dshash.source = function (query, sync, async) {
        lu.load.source(query, sync, async, formobject);
      };
      dshash.limit = 50;
      dshash.templates = {
        header: '<h3>' + lu.name + '</h3>',
        footer: '<div id="dropdown-footer" class=".col-sm-1"></div>'
      };
      // dshash.displayKey = (dshash.name.match(/^LCNAF|^LCSH/)) ? 'display' : 'value';
      dshash.displayKey = 'display';      
      dshashes.push(dshash);
    });

    bfelog.addMsg(new Error(), 'DEBUG', 'Data source hashes', dshashes);
    var opts = {
      minLength: 0,
      highlight: true,
      displayKey: 'value'
    };
    if (dshashes.length === 1) {
      $(input).typeahead(
        opts,
        dshashes[0]
      );
    } else if (dshashes.length === 2) {
      $(input).typeahead(
        opts,
        dshashes[0],
        dshashes[1]
      );
    } else if (dshashes.length === 3) {
      $(input).typeahead(
        opts,
        dshashes[0],
        dshashes[1],
        dshashes[2]
      );
    } else if (dshashes.length === 4) {
      $(input).typeahead(
        opts,
        dshashes[0],
        dshashes[1],
        dshashes[2],
        dshashes[3]
      );
    } else if (dshashes.length === 5) {
      $(input).typeahead(
        opts,
        dshashes[0],
        dshashes[1],
        dshashes[2],
        dshashes[3],
        dshashes[4]
      );
    } else if (dshashes.length === 6) {
      $(input).typeahead(
        opts,
        dshashes[0],
        dshashes[1],
        dshashes[2],
        dshashes[3],
        dshashes[4],
        dshashes[5]
      );
    }
    // Need more than 6?  That's crazy talk, man, crazy talk.   
    
    var buildContextHTML = function(data){
      var html = '';
      
        if (data.variant.length > 0) {
          html = html + '<div class="context-sources-list">';
          html = html + '<h5>Variants</h5><ul>';
          data.variant.forEach(function (c) {
            html = html + '<li>' + c + '</li>';
          });
          html = html + '</ul>';
        }

        if (data.source.length > 0) {
          html = html + '<h5>Sources</h5><ul>';
          data.source.forEach(function (c) {
            html = html + '<li>' + c + '</li>';
          });
          html = html + '</ul>';
        }
        
        if (data.contributor.length > 0) {
          html = html + '<h5>Contributors</h5><ul>';
          data.contributor.forEach(function (c) {
            html = html + '<li>' + c + '</li>';
          });
          html = html + '</ul>';
        }
        
        if (data.title) {
          html = html + '<h5>Main Title</h5><ul>';
            html = html + '<li>' + data.title + '</li>';
          html = html + '</ul>';
        }
        if (data.date) {
          html = html + '<h5>Creation Date</h5><ul>';
            html = html + '<li>' + data.date + '</li>';
          html = html + '</ul>';
        }
        if (data.genreForm) {
          html = html + '<h5>Genre Form</h5><ul>';
            html = html + '<li>' + data.genreForm + '</li>';
          html = html + '</ul>';
        }
        
        

        if (data.nodeMap.birthDate && data.nodeMap.birthDate.length > 0) {
          html = html + '<h5>Birth Date</h5><ul>';
          data.nodeMap.birthDate.forEach(function (c) {
            html = html + '<li>' + c.replace(/^\([a-z]+\)\s/,'') + '</li>';
          });
          html = html + '</ul>';
        }
        if (data.nodeMap.deathDate && data.nodeMap.deathDate.length > 0) {
          html = html + '<h5>Death Date</h5><ul>';
          data.nodeMap.deathDate.forEach(function (c) {
            html = html + '<li>' + c.replace(/^\([a-z]+\)\s/,'') + '</li>';
          });
          html = html + '</ul>';
        }
        
        if (data.nodeMap.birthPlace && data.nodeMap.birthPlace.length > 0) {
          html = html + '<h5>Birth Place</h5><ul>';
          data.nodeMap.birthPlace.forEach(function (c) {
            html = html + '<li>' + c.replace(/^\([a-z]+\)\s/,'') + '</li>';
          });
          html = html + '</ul>';
        }      
        if (data.nodeMap.associatedLocale && data.nodeMap.associatedLocale.length > 0) {
          html = html + '<h5>Associated Locale</h5><ul>';
          data.nodeMap.associatedLocale.forEach(function (c) {
            html = html + '<li>' + c.replace(/^\([a-z]+\)\s/,'') + '</li>';
          });
          html = html + '</ul>';
        }  
        if (data.nodeMap.fieldOfActivity && data.nodeMap.fieldOfActivity.length > 0) {
          html = html + '<h5>Field Of Activity</h5><ul>';
          data.nodeMap.fieldOfActivity.forEach(function (c) {
            html = html + '<li>' + c.replace(/^\([a-z]+\)\s/,'') + '</li>';
          });
          html = html + '</ul>';
        }  
        if (data.nodeMap.gender && data.nodeMap.gender.length > 0) {
          html = html + '<h5>Gender</h5><ul>';
          data.nodeMap.gender.forEach(function (c) {
            html = html + '<li>' + c.replace(/^\([a-z]+\)\s/,'') + '</li>';
          });
          html = html + '</ul>';
        }  
        if (data.nodeMap.occupation && data.nodeMap.occupation.length > 0) {
          html = html + '<h5>Occupation</h5><ul>';
          data.nodeMap.occupation.forEach(function (c) {
            html = html + '<li>' + c.replace(/^\([a-z]+\)\s/,'') + '</li>';
          });
          html = html + '</ul>';
        }  
        if (data.nodeMap.associatedLanguage && data.nodeMap.associatedLanguage.length > 0) {
          html = html + '<h5>Associated Language</h5><ul>';
          data.nodeMap.associatedLanguage.forEach(function (c) {
            html = html + '<li>' + c.replace(/^\([a-z]+\)\s/,'') + '</li>';
          });
          html = html + '</ul>';
        }  
        if (data.nodeMap.hasBroaderAuthority && data.nodeMap.hasBroaderAuthority.length > 0) {
          html = html + '<h5>Broader</h5><ul>';
          data.nodeMap.hasBroaderAuthority.forEach(function (c) {
            html = html + '<li>' + c + '</li>';
          });
          html = html + '</ul>';
        }  
        if (data.nodeMap.hasNarrowerAuthority && data.nodeMap.hasNarrowerAuthority.length > 0) {
          html = html + '<h5>Narrower</h5><ul>';
          data.nodeMap.hasNarrowerAuthority.forEach(function (c) {
            html = html + '<li>' + c + '</li>';
          });
          html = html + '</ul>';
        }  
        
        html = html + '</div><div style="text-align:right"><a target="_blank" href="' + data.uri + '">View on id.loc.gov</a></div>'
        return html;
      
    }
    
    $(input).on('typeahead:render', function (event, suggestions, asyncFlag, dataset) {
      bfelog.addMsg(new Error(), 'DEBUG', event, suggestions, asyncFlag, dataset);

      if (editorconfig.buildContext) {

        $('.tt-suggestion').each(function (i, v) {
          v = $(v);
          // already has been tooltipterized
          if (v.hasClass('tooltipstered')) {
            return true
          }

          // this grabs the URI for the typeahead and filters it on the url paths defined to have lookup information displayed, if it is > 0 then it passed the filter
          var shouldBuildContext = editorconfig.buildContextFor.filter(function (f) { return v.data().ttSelectableObject.uri.indexOf(f) > -1 });
          if (shouldBuildContext == 0) {
            return true
          }

          v.tooltipster({
            position: 'left',
            theme: 'tooltipster-shadow',
            contentAsHTML: true,
            animation: 'fade',
            updateAnimation: null,
            interactive: true,
            delay: [0, 300],
            content: '<strong>Loading...</strong>',
            // 'instance' is basically the tooltip. More details in the "Object-oriented Tooltipster" section.
            functionBefore: function (instance, helper) {
              // close anyone that are open
              $('.tt-suggestion').each(function (i, v) {
                v = $(v);
                if (v.hasClass('tooltipstered')) {
                  v.tooltipster('close')
                }
              });

              var $instance = $(instance._$origin[0]);
              var id = $instance.data('ttSelectableObject').id;
              var stored = sessionStorage.getItem(id);
              var $origin = $(helper.origin);

              // we set a variable so the data is only loaded once via Ajax, not every time the tooltip opens
              if ($origin.data('loaded') !== true) {

                if (stored) {

                  stored = JSON.parse(stored);
                  instance.content(buildContextHTML(stored));

                } else {

                  var useUri = $instance.data('ttSelectableObject').uri;
                  if (useUri.indexOf('id.loc.gov/resources/works/') > -1 && !_.isEmpty(editorconfig.buildContextForWorksEndpoint)) {
                    useUri = useUri.replace('http://id.loc.gov/resources/works/', editorconfig.buildContextForWorksEndpoint);
                  }
                  lcshared.fetchContextData(useUri, function (data) {

                    // call the 'content' method to update the content of our tooltip with the returned data.
                    // note: this content update will trigger an update animation (see the updateAnimation option)
                    data = JSON.parse(data)

                    instance.content(buildContextHTML(data));

                    // to remember that the data has been loaded
                    $origin.data('loaded', true);
                  });

                }


              }
            }
          });
        });

      }
    });

    $(input).on('typeahead:cursorchange', function () { //(event,selected,something)
           
      var v = $($(this).parent().find('.tt-cursor')[0]);
      $('.tt-selectable').tooltipster('close');
      v.tooltipster('open');   

    });

    $(input).on('typeahead:selected', function (event, suggestionobject, datasetname) {
      bfelog.addMsg(new Error(), 'DEBUG', 'Typeahead selection made');
      var form = $('#' + event.target.id).closest('form').eq(0);
      var formid = $('#' + event.target.id).closest('form').eq(0).attr('id');
      formid = formid.replace('bfeditor-form-', '');
      // reset page
      $(input).parent().siblings('.typeaheadpage').val(1);
      //var resourceid = $(form).children('div').eq(0).attr('id');
      var resourceURI = $(form).find('div[data-uri]').eq(0).attr('data-uri');

      var propertyguid = $('#' + event.target.id).attr('data-propertyguid');
      bfelog.addMsg(new Error(), 'DEBUG', 'propertyguid for typeahead input is ' + propertyguid);

      //var s = editorconfig.baseURI + resourceid;
      var p = '';
      var formobject = _.where(forms, {
        'id': formid
      });
      formobject = formobject[0];
      formobject.resourceTemplates.forEach(function (t) {
        var properties = _.where(t.propertyTemplates, {
          'guid': propertyguid
        });
        // console.log(properties);
        if (!_.isEmpty(properties[0])) {
          p = properties[0];
        }
      });

      var lups = _.where(lookups, {
        'name': datasetname
      });
      var lu;
      if (lups[0] !== undefined) {
        bfelog.addMsg(new Error(), 'DEBUG', 'Found lookup for datasetname: ' + datasetname, lups[0]);
        lu = lups[0].load;
      }

      // do we have new resourceURI?

      lu.getResource(resourceURI, p, suggestionobject, function (returntriples, property) {
        bfelog.addMsg(new Error(), 'DEBUG', "Triples returned from lookup's getResource func:", returntriples);

        var resourceTriple = '';
        var replaceBnode = !!(property.propertyLabel === 'Lookup' || property.type === 'lookup');
        var target = !!(property.type === 'target');

        returntriples.forEach(function (t) {
          if (_.isEmpty(t.guid)) {
            t.guid = shortUUID(guid());
          }

          // if this is the resource, replace the blank node; otherwise push the label
          if (_.some(formobject.store, {s: t.s}) && t.p !== 'http://www.w3.org/2000/01/rdf-schema#label') {
            
            resourceTriple = _.find(formobject.store, {o: t.s});

            if (!replaceBnode || _.isEmpty(resourceTriple)) {
              // push the triples
              if (formobject.resourceTemplates[0].embedType === 'modal'){
                formobject.store.push(t);
              } else {
                bfestore.addTriple(t);
              }
            } else {
              var resourceType = _.find(formobject.store, { p: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type', o: formobject.resourceTemplates[0].resourceURI });

              resourceType.s = t.o;
              formobject.store.push(resourceType);

              if (replaceBnode || target) {
                resourceTriple.o = t.o;

                formobject.defaulturi = t.o;
                // find the bnode
                formobject.store.push(resourceTriple);
                if (!_.some(formobject.store, {"guid": resourceTriple.guid})){
                  //if (target){
                    //also push the blank node.
                  //  t.target = 'true';
                  //  resourceTriple.target = 'true';
                  //  formobject.store.push(t);
                 //   bfestore.addTriple(t);
                  //}
                  formobject.store.push(resourceTriple);
                }
              } else {
                if (formobject.resourceTemplates[0].embedType === 'modal'){
                  formobject.store.push(t);
                } else {
                  bfestore.addTriple(t);
                }
              }
            }
          } else {
            if (formobject.resourceTemplates[0].embedType === 'modal'){
              formobject.store.push(t);
            } else {
              bfestore.addTriple(t);
            }
          }
        });

        // We only want to show those properties that relate to
        // *this* resource.
        if (returntriples[0].s == resourceURI) {
          formobject.resourceTemplates.forEach(function (rt) {
            // change structure from b_node property object to

            var properties = _.where(rt.propertyTemplates, {
              'propertyURI': returntriples[0].p
            });
            if (!_.isEmpty(properties[0] )) {
              var property = properties[0];
              var pguid = property.guid;

              var $formgroup = $('#' + pguid, formobject.form).closest('.form-group');
              var save = $formgroup.find('.btn-toolbar')[0];

              // var tlabel = _.findt.o;
              var tlabel = _.find(returntriples, {
                p: 'http://www.w3.org/2000/01/rdf-schema#label'
              }).o;

              var editable = true;
              if (property.valueConstraint.editable !== undefined && property.valueConstraint.editable === 'false') {
                editable = false;
              }

              // is there a type?
              if (_.has(property.valueConstraint.valueDataType, 'dataTypeURI')) {
                if (!_.isEmpty(property.valueConstraint.valueDataType.dataTypeURI)) {
                  var typeTriple = {};

                  typeTriple.s = _.find(returntriples, {
                    p: 'http://www.w3.org/2000/01/rdf-schema#label'
                  }).s;
                  typeTriple.guid = shortUUID(guid());
                  typeTriple.p = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'; // rdf:type
                  typeTriple.o = property.valueConstraint.valueDataType.dataTypeURI;
                  typeTriple.otype = 'uri';
                  if (formobject.resourceTemplates[0].embedType === 'modal'){
                    formobject.store.push(typeTriple);
                  } else {
                    bfestore.addTriple(typeTriple);
                    //bfestore.store.push(typeTriple);
                  }
                }
              }

              var bgvars = {
                'editable': editable,
                'tguid': returntriples[0].guid,
                'tlabel': tlabel,
                'tlabelhover': tlabel,
                'fobjectid': formobject.id,
                'inputid': pguid,
                'triples': returntriples
              };
              var $buttongroup = editDeleteButtonGroup(bgvars);

              $(save).append($buttongroup);

              $('#' + pguid, formobject.form).val('');
              $('#' + pguid, formobject.form).typeahead('val', '');
              $('#' + pguid, formobject.form).typeahead('close');

              if (property.repeatable === 'false' || property.valueConstraint.repeatable == 'false') {
                var $el = $('#' + pguid, formobject.form);
                if ($el.is('input')) {
                  $el.prop('disabled', true);
                  $el.css('background-color', '#EEEEEE');
                } else {
                  var $buttons = $('div.btn-group', $el).find('button');
                  $buttons.each(function () {
                    $(this).prop('disabled', true);
                  });
                }
              }
            }
          });
        }

        bfestore.storeDedup();
        $('#bfeditor-debug').html(JSON.stringify(bfestore.store, undefined, ' '));
      });
    });
  }

  function buildLookup(name) {
    var lcshared = require('src/lookups/lcshared');
    var cache = [];
    var lu = {};
    lu.name = name.substr(name.lastIndexOf('/') + 1);
    lu.load = {};
    lu.load.scheme = name;
    lu.load.source = function (query, processSync, processAsync) {
      return lcshared.simpleQuery(query, cache, name, processSync, processAsync);
    };

    lu.load.getResource = function (subjecturi, property, selected, process) {
      return lcshared.getResource(subjecturi, property, selected, process);
    };

    return lu;
  }

  function editTriple(formobjectID, inputID, t) {
    var formobject = _.where(forms, {
      'id': formobjectID
    });
    formobject = formobject[0];
    bfelog.addMsg(new Error(), 'DEBUG', 'Editing triple: ' + t.guid, t);
    $('#' + t.guid).empty();
    
    
    var $el = $('#' + inputID, formobject.form);
    if ($el.is('input') && $el.hasClass('typeahead')) {
      var $inputs = $('#' + inputID, formobject.form).parent().find("input[data-propertyguid='" + inputID + "']");
      // is this a hack because something is broken?
      $inputs.each(function () {
        $(this).prop('disabled', false);
        $(this).removeAttr('disabled');
        $(this).css('background-color', 'transparent');
      });
    } else if ($el.is('input')) {
      $el.prop('disabled', false);
      $el.removeAttr('disabled');
      // el.css( "background-color", "transparent" );
    } else {
      var $buttons = $('div.btn-group', $el).find('button');
      $buttons.each(function () {
        $(this).prop('disabled', false);
      });
    }

    if ($el.is('input') && t.otype == 'literal') {
      $el.val(t.o);
      // if the olang is populated try to split out the lang and script and populate the select fields that should exist
      if (t.olang && t.olang !== "" && t.olang.indexOf('-')>-1){
        var lang = t.olang.split('-')[0].toLowerCase();
        var script =  t.olang.split('-')[1].charAt(0).toUpperCase() + t.olang.split('-')[1].slice(1).toLowerCase();
        $('#' + inputID + '-lang').val(lang);
        $('#' + inputID + '-script').val(script);
      }else if (t.olang && t.olang !== "" && t.olang.indexOf('-')==-1){
        $('#' + inputID + '-lang').val(t.olang.toLowerCase());
        $('#' + inputID + '-script').val('');
      
      }
    }
    formobject.store = _.without(formobject.store, _.findWhere(formobject.store, {
      guid: t.guid
    }));
    bfestore.store = _.without(bfestore.store, _.findWhere(bfestore.store, {
      guid: t.guid
    }));
    $('#bfeditor-debug').html(JSON.stringify(bfestore.store, undefined, ' '));
  }

  function editTriples(formobjectID, inputID, tguid, triples) {
    bfelog.addMsg(new Error(), 'DEBUG', 'Editing triples', triples);
    var resourceTypes = _.where(triples, {
      'p': 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
    });
    var bnode = _.find(triples, {guid:tguid});

    if (resourceTypes[0] == undefined) {
      // try @type?
      resourceTypes = _.where(triples, {
        'p': '@type'
      });
    }
    bfelog.addMsg(new Error(), 'DEBUG', 'Triples represent these resourceTypes', resourceTypes);
    
    var thisResourceType = _.find(resourceTypes, {s: bnode.o})

   /* for (var i in resourceTypes){
      if (resourceTypes[i].rtID !== undefined){
        thisResourceType = resourceTypes[i];
      }
    }*/

    if (thisResourceType !== undefined && typeof thisResourceType !== undefined && thisResourceType.rtID !== undefined) {
      // function openModal(callingformobjectid, rtguid, propertyguid, template) {
      var callingformobject = _.where(forms, {
        'id': formobjectID
      });
      callingformobject = callingformobject[0];

      var templates = _.where(resourceTemplates, {
        'id': thisResourceType.rtID
      });
      if (templates[0] !== undefined) {
        // The subject of the resource matched with the "type"
        bfelog.addMsg(new Error(), 'DEBUG', 'Opening modal for editing', triples);
        openModal(callingformobject.id, templates[0], thisResourceType.s, inputID, triples);
      }
    } else {
      removeTriples(formobjectID, inputID, tguid, triples);
    }
  }

  function removeTriple(formobjectID, inputID, tguid, t) {
    var formobject = _.where(forms, {
      'id': formobjectID
    });
    
    formobject = formobject[0];
    if ($('#' + t.guid).length && t !== undefined) {
      bfelog.addMsg(new Error(), 'DEBUG', 'Removing triple: ' + t.guid, t);
      // $("#" + t.guid).empty();
      $('#' + t.guid).remove();
    } else if ($('#' + tguid).length){
    
      bfelog.addMsg(new Error(), 'DEBUG', 'Removing triple: ' + tguid, null);
      //$('#' + tguid).remove();
    }

    if (!_.isEmpty(t.guid)) {
      bfelog.addMsg(new Error(), 'DEBUG', 'Removing triple: ' + t.guid);
      formobject.store = _.without(formobject.store, _.findWhere(formobject.store, {
        guid: t.guid
      }));
      bfestore.store = _.without(bfestore.store, _.findWhere(bfestore.store, {
        guid: t.guid
      }));
    } else {
      //no guid
      /*formobject.store = _.without(formobject.store, _.findWhere(formobject.store, {
        s: t.s, p: t.p, o: t.o
      }));
      bfestore.store = _.without(bfestore.store, _.findWhere(bfestore.store, {
        s: t.s, p: t.p, o: t.o
      }));*/
      bfelog.addMsg(new Error(), 'DEBUG', 'Missing guid - formobjectID: ' + formobjectID + ' inputID: ' + inputID + ' tguid' + tguid, t);
    }

    var $el = $('#' + inputID, formobject.form);
    if ($el.is('input') && $el.hasClass('typeahead')) {
      var $inputs = $('#' + inputID, formobject.form).parent().find("input[data-propertyguid='" + inputID + "']");
      // is this a hack because something is broken?
      $inputs.each(function () {
        $(this).prop('disabled', false);
        $(this).removeAttr('disabled');
        $(this).css('background-color', 'transparent');
      });
    } else if ($el.is('input')) {
      $el.prop('disabled', false);
      $el.removeAttr('disabled');
      // el.css( "background-color", "transparent" );
    } else {
      var $buttons = $('div.btn-group', $el).find('button');
      $buttons.each(function () {
        $(this).prop('disabled', false);
      });
    }
    /*formobject.store = _.without(formobject.store, _.findWhere(formobject.store, {
      guid: t.guid
    }));
    bfestore.store = _.without(bfestore.store, _.findWhere(bfestore.store, {
      guid: t.guid
    }));*/

    $('#bfeditor-debug').html(JSON.stringify(bfestore.store, undefined, ' '));
  }

  function removeTriples(formobjectID, inputID, tID, triples) {
    bfelog.addMsg(new Error(), 'DEBUG', 'Removing triples for formobjectID: ' + formobjectID + ' and inputID: ' + inputID, triples);
    triples.forEach(function (triple) {
      removeTriple(formobjectID, inputID, tID, triple);
    });
  }

  /**
     * Generate string which matches python dirhash
     * @returns {String} the generated string
     * @example GCt1438871386
     *
     */
  function guid() {
    var translator = window.ShortUUID();
    return translator.uuid();
  }

  function shortUUID(uuid) {
    var translator = window.ShortUUID();
    return translator.fromUUID(uuid);
  }

  function mintResource(uuid) {
    var decimaltranslator = window.ShortUUID('0123456789');
    return 'e' + decimaltranslator.fromUUID(uuid);
  }

  function whichrt(rt, baseURI, callback) {
    // for resource templates, determine if they are works, instances, or other
    var uri;
    if (rt.resourceURI.startsWith('http://www.loc.gov/mads/rdf/v1#')) {
      uri = rt.resourceURI.replace('http://www.loc.gov/mads/rdf/v1#', config.url + '/bfe/static/v1.json#');
    } else if (rt.resourceURI.startsWith('http://id.loc.gov/resources' && !_.isEmpty(config.resourceURI))) {
      uri = rt.resourceURI.replace('http://id.loc.gov/resources', config.resourceURI) + '.json';
    } else if (rt.resourceURI.startsWith(config.rectobase +'/resources')) {
      return;
    } else {
      uri = rt.resourceURI + '.json';
    }
    $.ajax({
      type: 'GET',
      async: false,
      url: uri,
      success: function (data) {
        var returnval = '_:bnode';
        var truthy = false;
        data.some(function (resource) {
          if (resource['@id'] === rt.resourceURI && !truthy) {
            if (resource['http://www.w3.org/2000/01/rdf-schema#subClassOf'] !== undefined) {
              if (resource['http://www.w3.org/2000/01/rdf-schema#subClassOf'][0]['@id'] === 'http://id.loc.gov/ontologies/bibframe/Work') {
                returnval = baseURI + 'resources/works/';
                truthy = true;
              } else if (resource['http://www.w3.org/2000/01/rdf-schema#subClassOf'][0]['@id'] === 'http://id.loc.gov/ontologies/bibframe/Instance') {
                returnval = baseURI + 'resources/instances/';
                truthy = true;
              } else if (resource['http://www.w3.org/2000/01/rdf-schema#subClassOf'][0]['@id'] === 'http://www.loc.gov/mads/rdf/v1#Name') {
                returnval = baseURI + 'resources/agents/';
                truthy = true;
              }
            } else if (resource['@id'] === 'http://id.loc.gov/ontologies/bibframe/Instance') {
              returnval = baseURI + 'resources/instances/';
              truthy = true;
            } else if (resource['@id'] === 'http://id.loc.gov/ontologies/bibframe/Work') {
              returnval = baseURI + 'resources/works/';
              truthy = true;
            }
          }
        });
        callback(returnval);
      },
      error: function (XMLHttpRequest, textStatus, errorThrown) {
        bfelog.addMsg(new Error(), 'ERROR', 'Request status: ' + textStatus + '; Error msg: ' + errorThrown);
      }
    });

    // return returnval;
  }

  function whichLabel(uri, store, callback) {

    if(_.isEmpty(store)){
      store = bfestore.store;
    }
    // for resource templates, determine if they are works, instances, or other
    var jsonuri = uri + '.json';
    // normalize
    if (uri.startsWith('http://id.loc.gov/resources' && !_.isEmpty(config.resourceURI))) {
      jsonuri = uri.replace('http://id.loc.gov/resources', config.resourceURI) + '.jsonld';
    }

    if (uri.endsWith('marcxml.xml')) {
      var returnval = /[^/]*$/.exec(uri)[0].split('.')[0];
      callback(returnval);
    } else if (uri.match(/[works|instances]\/\d+#\w+\d+-\d+/) || uri.match(/_:.*/g) ) {      //fake uris
      if(_.some(store, { s: uri, p: "http://www.w3.org/2000/01/rdf-schema#label"})){
        callback(_.find(store, { s: uri, p: "http://www.w3.org/2000/01/rdf-schema#label" }).o);  
      } else if(_.some(store, { s: uri, p: "http://www.loc.gov/mads/rdf/v1#authoritativeLabel"})){
        callback(_.find(store, { s: uri, p: "http://www.loc.gov/mads/rdf/v1#authoritativeLabel" }).o);
      } else if(_.some(store, { s: uri, p: "http://www.w3.org/1999/02/22-rdf-syntax-ns#value"})){
        callback(_.find(store, { s: uri, p: "http://www.w3.org/1999/02/22-rdf-syntax-ns#value" }).o);
      } else {
        callback("");
      }
    } else {
      $.ajax({
        type: 'GET',
        async: false,
        data: {
          uri: jsonuri
        },
        url: config.url + '/profile-edit/server/whichrt',
        success: function (data) {
          var returnval;
          var labelelements = _.where(data, 'http://www.loc.gov/mads/rdf/v1#authoritativeLabel');

          if (labelelements !== undefined && !_.isEmpty(labelelements)) {
            returnval = _.find(labelelements, { '@id': uri })['http://www.loc.gov/mads/rdf/v1#authoritativeLabel']
            if (!_.isEmpty(returnval)){
              returnval = returnval[0]['@value'];
            } else {
              _.find(labelelements, 'http://www.loc.gov/mads/rdf/v1#authoritativeLabel')['http://www.loc.gov/mads/rdf/v1#authoritativeLabel'][0]["@value"]
            }
          } else {
            // look for a rdfslabel
            var labels = _.filter(data[2], function (prop) { if (prop[0] === 'rdfs:label') return prop; });

            if (!_.isEmpty(labels)) {
              returnval = labels[0][2];
            } else {
              returnval = uri;
            }
          }

          callback(returnval);
        },
        error: function (XMLHttpRequest, textStatus, errorThrown) {
          bfelog.addMsg(new Error(), 'ERROR', 'Request status: ' + textStatus + '; Error msg: ' + errorThrown);
        }
      });
    }

    // return returnval;
  }
});
