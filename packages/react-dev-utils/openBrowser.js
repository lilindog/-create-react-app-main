/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 *
 * 该包负责打开浏览器，使用传入的url
 *
 *
 * ！注意这两个环境变量 BROWSER BROWSER_ARGS
 *
 *  * BROWSER === "xxx.js" 时候将使用子进程执行xxx.js 传入当前进程的启动参数 + url； 立即返回true。
 *  * BROWSER === "none" 时，该包啥也不做， 直接返回false。
 *  * BROWSER 没有值，或者不是上面2种值时，请看以下：
 *
 *
 *     1. mac系统 并且 BROWSER = "google chrome" || void 时候，尝试打开一下浏览器（依次按先后顺序尝试）：
 *       'Google Chrome Canary',
 *       'Google Chrome Dev',
 *       'Google Chrome Beta',
 *       'Google Chrome',
 *       'Microsoft Edge',
 *       'Brave Browser',
 *       'Vivaldi',
 *       'Chromium',
 *       若打开了，则返回true
 *       若都尝试了却没有打开，则进入后续逻辑。
 *
 *      2.mac系统 并且 BROWSER = "open" 时， 直接使用open模块打开url; 成功返回true， 反之false。
 *
 *      3.其他（如非mac系统）时，使用open模块 使用 BROWSER 的名称，加上BROWSER_ARGS参数打开url；成功返回true， 反之false。
 *
 *
 *
 *
 *
 *
 *
 */


'use strict';

var chalk = require('chalk');
var execSync = require('child_process').execSync;
var spawn = require('cross-spawn');
var open = require('open');

// https://github.com/sindresorhus/open#app
var OSX_CHROME = 'google chrome';

const Actions = Object.freeze({
  NONE: 0,
  BROWSER: 1,
  SCRIPT: 2,
});

function getBrowserEnv() {
  // Attempt to honor this environment variable.
  // It is specific to the operating system.
  // See https://github.com/sindresorhus/open#app for documentation.
  const value = process.env.BROWSER;
  const args = process.env.BROWSER_ARGS
    ? process.env.BROWSER_ARGS.split(' ')
    : [];
  let action;
  if (!value) {
    // Default.
    action = Actions.BROWSER;
  } else if (value.toLowerCase().endsWith('.js')) {
    action = Actions.SCRIPT;
  } else if (value.toLowerCase() === 'none') {
    action = Actions.NONE;
  } else {
    action = Actions.BROWSER;
  }
  return { action, value, args };
}

function executeNodeScript(scriptPath, url) {
  const extraArgs = process.argv.slice(2);
  const child = spawn(process.execPath, [scriptPath, ...extraArgs, url], {
    stdio: 'inherit',
  });
  child.on('close', code => {
    if (code !== 0) {
      console.log();
      console.log(
        chalk.red(
          'The script specified as BROWSER environment variable failed.'
        )
      );
      console.log(chalk.cyan(scriptPath) + ' exited with code ' + code + '.');
      console.log();
      return;
    }
  });
  return true;
}

function startBrowserProcess(browser, url, args) {
  // If we're on OS X, the user hasn't specifically
  // requested a different browser, we can try opening
  // Chrome with AppleScript. This lets us reuse an
  // existing tab when possible instead of creating a new one.

  /** 如果是mac系统并且 process.env.BROWSER 等于 "google chrome" 或没有 时  */
  const shouldTryOpenChromiumWithAppleScript =
    process.platform === 'darwin' &&
    (typeof browser !== 'string' || browser === OSX_CHROME);

  if (shouldTryOpenChromiumWithAppleScript) {
    // Will use the first open browser found from list

    /** 浏览器启动名集合 */
    const supportedChromiumBrowsers = [
      'Google Chrome Canary',
      'Google Chrome Dev',
      'Google Chrome Beta',
      'Google Chrome',
      'Microsoft Edge',
      'Brave Browser',
      'Vivaldi',
      'Chromium',
    ];

    /**
     * 使用上面的名字，尝试打开浏览器，使用传入url参数打开指定页面
     *
     * 打开成功则退出逻辑，返回继续向下尝试其他
     */
    for (let chromiumBrowser of supportedChromiumBrowsers) {
      try {
        // Try our best to reuse existing tab
        // on OSX Chromium-based browser with AppleScript
        execSync('ps cax | grep "' + chromiumBrowser + '"');
        execSync(
          'osascript openChrome.applescript "' +
            encodeURI(url) +
            '" "' +
            chromiumBrowser +
            '"',
          {
            cwd: __dirname,
            stdio: 'ignore',
          }
        );
        return true;
      } catch (err) {
        // Ignore errors.
      }
    }
  }

  // Another special case: on OS X, check if BROWSER has been set to "open".
  // In this case, instead of passing `open` to `opn` (which won't work),
  // just ignore it (thus ensuring the intended behavior, i.e. opening the system browser):
  // https://github.com/facebook/create-react-app/pull/1690#issuecomment-283518768
  if (process.platform === 'darwin' && browser === 'open') {
    browser = undefined;
  }

  // If there are arguments, they must be passed as array with the browser
  if (typeof browser === 'string' && args.length > 0) {
    browser = [browser].concat(args);
  }

  // Fallback to open
  // (It will always open new tab)
  try {
    var options = { app: browser, wait: false, url: true };
    open(url, options).catch(() => {}); // Prevent `unhandledRejection` error.
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Reads the BROWSER environment variable and decides what to do with it. Returns
 * true if it opened a browser or ran a node.js script, otherwise false.
 */


/** 成功打开返回true， 反之返回false */
function openBrowser(url) {
  const { action, value, args } = getBrowserEnv();
  switch (action) {
    case Actions.NONE:
      // Special case: BROWSER="none" will prevent opening completely.
      return false;
    case Actions.SCRIPT:
      return executeNodeScript(value, url);
    case Actions.BROWSER:
      return startBrowserProcess(value, url, args);
    default:
      throw new Error('Not implemented.');
  }
}

module.exports = openBrowser;
