#!/usr/bin/env node

const argv = require ('minimist') (process.argv.slice (2));
const { Docker } = require ('node-docker-api');
const ngrok =  require ('ngrok');
const dc = require ('docker-compose');
const request = require ('request-promise-native');
const waitOn = require ('wait-on');

if (argv.help) {
  help ();
  process.exit (0);
}

if (!argv._[0]) {
  console.error ('\nERROR: No WebHookURL provided.');
  help ();
  process.exit (1);
}

const docker = new Docker ({ socketPath: '/var/run/docker.sock' });
const skHome = argv['sk-home'] || process.env['ACE_STARTERKIT_HOME'] || '.';
const skGrafanaContainer = argv['sk-grafana-container'] || 'ace-grafana';
const skContentServiceContainer = argv['sk-content-service-container'] || 'ace-content-service';
const gfServerRootUrl = argv['gf-server-root-url'] || 'http://ace.local:3000';
const ngrokRegion = argv['ngrok-region'] || 'eu';
const ngrokAddr = argv['ngrok-addr'] || 3000;

if (argv.verbose) {
  console.error ('  WebHookURL: ');
  console.error ('    ' + argv._[0]);
  console.error ('  Options:');
  console.error ('   --tunnel                          ' + argv.tunnel + ' -> ' + !!argv.tunnel);
  console.error ('   --verbose                         ' + argv.verbose + ' -> ' + !!argv.verbose);
  console.error ('   --gf-server-root-url              ' + argv['gf-server-root-url'] + ' -> ' + gfServerRootUrl);
  console.error ('   --sk-home                         ' + argv['sk-home'] + ' -> ' + skHome);
  console.error ('   --sk-grafana-container            ' + argv['sk-grafana-container'] + ' -> ' + skGrafanaContainer);
  console.error ('   --sk-content-service-container    ' + argv['sk-content-service-container'] + ' -> ' + skContentServiceContainer);
  console.error ('   --ngrok-region                    ' + argv['ngrok-region'] + ' -> ' + ngrokRegion);
  console.error ('   --ngrok-addr                      ' + argv['ngrok-addr'] + ' -> ' + ngrokAddr);
}

function help () {
  console.log ();
  console.log ('  Usage: ace-starterkit-grafana-slack [options] <WebHookURL>');
  console.log ();
  console.log ('  Set up a grafana notification channel to Slack in an ace-starterkit set-up. It is possible to setup a tunnel between the');
  console.log ('  local grafana application and a public ip address through ngrok if images cannot be provided in another publicly way.');
  console.log ();
  console.log (' Arguments:');
  console.log ();
  console.log ('   WebHookURL                        A Slack workspace webhook URL (required)');
  console.log ();
  console.log (' Options:');
  console.log ('');
  console.log ('   --tunnel                          Tunnel local grafana to an adress on the Internet.');
  console.log ('   --verbose                         Verbose output.');
  console.log ('   --gf-server-root-url              The url to the grafana application (if --tunnel is set this value will be ignored.  (http://localhost:3000)');
  console.log ('   --sk-home                         Path to ace-starterkit directory overrides env ACE_STARTERKIT_HOME.  (.)');
  console.log ('   --sk-grafana-container            Grafana docker container name.  (ace-grafana)');
  console.log ('   --sk-content-service-container    Content Service docker container name.  (ace-content-service)');
  console.log ('   --ngrok-region                    The region for ngrok to use.  [ us | eu | ap | au ]  (eu)');
  console.log ('   --ngrok-addr                      ngrok will use this local port number or network address to forward traffic.  (3000)');
}

docker.container.list ()
  .then ((containers) => {
    argv.verbose && console.error ('Is container [' + skContentServiceContainer + '] available?');
    let aceContentService = containers.find ((container) => {
      return container.data.Names.includes ('/' + skContentServiceContainer);
    });

    if (!aceContentService) {
      argv.verbose && console.log ('No [' + skContentServiceContainer + '] container was found. throw error.');
      throw skContentServiceContainer + ' not found. Is ace-starterkit up and running?';
    }

    argv.verbose && console.log ('Is container [' + skGrafanaContainer + '] available?');
    return containers.find ((container) => {
      return container.data.Names.includes ('/' + skGrafanaContainer);
    });
  })
  .then ((aceGrafana) => {
    if (aceGrafana) {
      return aceGrafana.stop ();
    } else {
      argv.verbose && console.error (skGrafanaContainer + ' container not found. Will try to start it later.');
      return;
    }
  })
  .then (() => {
    console.error (skGrafanaContainer + ' stopped.');
    if (argv.tunnel) {
      argv.verbose && console.error ('Setting up tunnel for [' + ngrokAddr + '] in region [' + ngrokRegion + ']'); 
      return ngrok.connect ({ addr: ngrokAddr, region: ngrokRegion });
    } else {
      argv.verbose && console.error ('No tunnel. Restarting grafana.');
      return gfServerRootUrl;
    }
  })
  .then ((rootUrl) => {
    process.env['ACE_VERSION'] = '';
    process.env['CONTENT_DEVELOPER_VERSION'] = '';
    process.env['CORE_ADMIN_VERSION'] = '';
    process.env['GF_SERVER_ROOT_URL'] = rootUrl;
    if (argv.tunnel) {
      process.env['GF_DEFAULT_APP_MODE'] = 'development';
      process.env['GF_EXTERNAL_IMAGE_STORAGE_PROVIDER'] = 'local'; 
      console.log ('Public URL: ' + rootUrl);
    }
    argv.verbose && console.error ('Starting ' + skGrafanaContainer);
    argv.verbose && console.error (process.env);
    return dc.upOne (skGrafanaContainer, { cwd: skHome });
  })
  .then (() => {
    // Wait for grafana
    argv.verbose && console.error ('Waiting for Grafana to come up.')
    return waitOn ({
      resources: ['http://admin:admin@localhost:3000/api/alert-notifications'],
      auth: {
        user: 'admin',
        pass: 'admin'
      }
    });
  })
  .then (() => {
    console.error (skGrafanaContainer + ' is up again.');
    let payload = {
      type: 'slack',
      settings: {
        uploadImage: true,
        url: argv._[0]
      },
      isDefault: true,
      name: 'slack'
    };

    return request ({
      method: 'POST',
      url: 'http://admin:admin@localhost:3000/api/alert-notifications',
      json: payload
    });
  })
  .then (() => {
    if (argv.tunnel) {
      console.error ('A tunnel has been set-up, exiting this process will terminate that tunnel.')
      console.error ('(Ctrl-C to Exit)');
    } else {
      console.error ('Success. Created notification channel to Slack for Grafana.');
    }
  })
  .catch ((error) => {
    console.error (error && error.message && (error.message || 'Unknown error.'));
    if (error) {
      console.error (error.message || error);
    } else {
      console.error ('ERROR: Unknown error!');
    }
    process.exit (1);
  });
