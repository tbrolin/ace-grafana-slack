#!/usr/bin/env node

const argv = require ('minimist') (process.argv.slice (2));
const { Docker } = require ('node-docker-api');
const ngrok =  require ('ngrok');
const dc = require ('docker-compose');
const request = require ('request-promise-native');
const waitOn = require ('wait-on');

// if no ace-content-service -> exit
// stop ace-grafana if running
// start ngrok http localhost 3000
// start ace-grafana with GF_SERVER_ROOT_URL
// set grafana notification channel

const docker = new Docker ({ socketPath: '/var/run/docker.sock' });
const skHome = argv['sk-home'] || process.env['ACE_STARTERKIT_HOME'] || '.';
const skGrafanaContainer = argv['sk-grafana-container'] || 'ace-grafana';
const skContentServiceContainer = argv['sk-content-service-container'] || 'ace-content-service';
const ngrokRegion = argv['ngrok-region'] || 'eu';
const ngrokAddr = argv['ngrok-addr'] || 3000;

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
  console.log ('   --gf-server-root-url              The url to the grafana application (if --tunnel is set this value will be ignored.  (http://localhost:3000)');
  console.log ('   --sk-home                         Path to ace-starterkit directory overrides env ACE_STARTERKIT_HOME.  (.)');
  console.log ('   --sk-grafana-container            Grafana docker container name.  (ace-grafana)');
  console.log ('   --sk-content-service-container    Content Service docker container name.  (ace-content-service)');
  console.log ('   --ngrok-region                    The region for ngrok to use.  [ us | eu | ap | au ]  (eu)');
  console.log ('   --ngrok-addr                      ngrok will use this local port number or network address to forward traffic.  (3000)');
}

if (argv.help) {
  help ();
  process.exit (0);
}

if (!argv._[0]) {
  console.error ('\nERROR: No WebHookURL provided.');
  help ();
  process.exit (1);
}

docker.container.list ()
  .then ((containers) => {
    let aceContentService = containers.find ((container) => {
      return container.data.Names.includes ('/' + skContentServiceContainer);
    });

    if (!aceContentService) {
      throw skContentServiceContainer + ' not found. Is ace-starterkit up and running?';
    }

    return containers.find ((container) => {
      return container.data.Names.includes ('/' + skGrafanaContainer);
    });
  })
  .then (aceGrafana => aceGrafana ? aceGrafana.stop () : {})
  .then (() => {
    console.log (skGrafanaContainer + ' stopped.');
    if (argv.tunnel) {
      return ngrok.connect ({ addr: ngrokAddr, region: ngrokRegion });
    } else {
      return argv['gf-server-root-url'] || 'https://localhost:3000';
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
    return dc.upOne (skGrafanaContainer, { cwd: skHome });
  })
  .then (() => {
    // Wait for grafana
    return waitOn ({
      resources: ['http://admin:admin@localhost:3000/api/alert-notifications'],
      auth: {
        user: 'admin',
        pass: 'admin'
      }
    });
  })
  .then (() => {
    console.log (skGrafanaContainer + ' is up again.');
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
      console.log ('A tunnel has been set-up, exiting this process will terminate that tunnel.')
      console.log ('(Ctrl-C to Exit)');
    } else {
      console.log ('Success. Created notification channel to Slack for Grafana.');
    }
  })
  .catch ((error) => {
    console.log (error.message);
    process.exit (1);
  });
