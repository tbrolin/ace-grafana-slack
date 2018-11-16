# ace-grafana-slack

A utility to quickly add the ability to get slack notifications from
Grafana alerts in **ace-starterkit**. To be able to push images to slack
those images has to be publicly available on the Internet. This utility
can set up a tunnel (use `--tunnel` option) using ngrok to acheive that.

# Install

```bash
$ npm install @atex/ace-slack-grafana -g    # Install as global
$ ace-starterkit-grafana-slack --help       # command is now available
```

# Developer setup

```bash
$ git clone ...             # Clone the repository
$ cd ace-grafana-slack      # Navigate to dir
$ npm install -g            # Install it globally
$ npm link                  # links the global installation to this directory
```

Changes made to the code will now take effect immediately.

# Uninstalling

```bash
$ npm uninstall -g
```
