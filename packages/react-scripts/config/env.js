// @remove-on-eject-begin
/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

// @remove-on-eject-end
'use strict';

const fs = require('fs');
const path = require('path');
const paths = require('./paths');

// Make sure that including paths.js after env.js will read .env variables.
/** 干掉./paths模块的 cjs 缓存 */
delete require.cache[require.resolve('./paths')];

/** 读取NODE_ENV 一般为 development 或 production */
const NODE_ENV = process.env.NODE_ENV; // 缺省为 "development"
/** 没有初始化NODE环境变量，抛错，退出进程 */
if (!NODE_ENV) {
  throw new Error(
    'The NODE_ENV environment variable is required but was not specified.'
  );
}

// https://github.com/bkeepers/dotenv#what-other-env-files-can-i-use
const dotenvFiles = [
  /** 包含 ${projrct}/.env.development.local */
  `${paths.dotenv}.${NODE_ENV}.local`,
  // Don't include `.env.local` for `test` environment
  // since normally you expect tests to produce the same
  // results for everyone
  /** 环境不是test时，包含 ${project}/.env.local */
  NODE_ENV !== 'test' && `${paths.dotenv}.local`,
  /** 包含 ${projrct}/.env.development */
  `${paths.dotenv}.${NODE_ENV}`,
  /** 包含 ${project}/.env */
  paths.dotenv,
].filter(Boolean);

// Load environment variables from .env* files. Suppress warnings using silent
// if this file is missing. dotenv will never modify any environment variables
// that have already been set.  Variable expansion is supported in .env files.
// https://github.com/motdotla/dotenv
// https://github.com/motdotla/dotenv-expand
/**
 * 加载上面列出的所有的dotenv文件
 * 到进程环境变量
 */
dotenvFiles.forEach(dotenvFile => {
  if (fs.existsSync(dotenvFile)) {

    /**
     * 增加内层返回的 { prsed: { [key: string]: string } } 环境变量到进程
     * 同名则使用进程原有的
     *
     *
     * 与require('dotenv').config() 不同的是：
     *
     * 若值存在${key:-defaultValue} 则替换为进程变量中存在的对应值, 或defaultValue 或 ''
     */
    require('dotenv-expand')(

      /**
       * 读取指定文件环境变量 合并 到进程
       * 同时也返回一份, 返回的结构变成了：
       *    { poarsed: { [key: string]: any } }
       *    参见dotenv源码 95行 https://github.com/motdotla/dotenv/blob/master/lib/main.js
       */
      require('dotenv').config({
        path: dotenvFile,
      })

    );
  }
});

// We support resolving modules according to `NODE_PATH`.
// This lets you use absolute paths in imports inside large monorepos:
// https://github.com/facebook/create-react-app/issues/253.
// It works similar to `NODE_PATH` in Node itself:
// https://nodejs.org/api/modules.html#modules_loading_from_the_global_folders
// Note that unlike in Node, only *relative* paths from `NODE_PATH` are honored.
// Otherwise, we risk importing Node.js core modules into an app instead of webpack shims.
// https://github.com/facebook/create-react-app/issues/1023#issuecomment-265344421
// We also resolve them to make sure all tools using them work consistently.
const appDirectory = fs.realpathSync(process.cwd());
/** 检查NODE_PATH 环境变量的合法性，过滤掉不合法的 */
process.env.NODE_PATH = (process.env.NODE_PATH || '')
  .split(path.delimiter)
  .filter(folder => folder && !path.isAbsolute(folder))
  .map(folder => path.resolve(appDirectory, folder))
  .join(path.delimiter);

// Grab NODE_ENV and REACT_APP_* environment variables and prepare them to be
// injected into the application via DefinePlugin in webpack configuration.
/** 匹配REACT_APP 开头 的正则 */
const REACT_APP = /^REACT_APP_/i;

/**
 *
 * 导出主函数
 *
 */
function getClientEnvironment(publicUrl) {
  const raw = Object.keys(process.env)
    .filter(key => REACT_APP.test(key))
    .reduce(
      (env, key) => {
        env[key] = process.env[key];
        return env;
      },
      {
        // Useful for determining whether we’re running in production mode.
        // Most importantly, it switches React into the correct mode.
        NODE_ENV: process.env.NODE_ENV || 'development',
        // Useful for resolving the correct path to static assets in `public`.
        // For example, <img src={process.env.PUBLIC_URL + '/img/logo.png'} />.
        // This should only be used as an escape hatch. Normally you would put
        // images into the `src` and `import` them in code to get their paths.
        PUBLIC_URL: publicUrl,
        // We support configuring the sockjs pathname during development.
        // These settings let a developer run multiple simultaneous projects.
        // They are used as the connection `hostname`, `pathname` and `port`
        // in webpackHotDevClient. They are used as the `sockHost`, `sockPath`
        // and `sockPort` options in webpack-dev-server.
        WDS_SOCKET_HOST: process.env.WDS_SOCKET_HOST,
        WDS_SOCKET_PATH: process.env.WDS_SOCKET_PATH,
        WDS_SOCKET_PORT: process.env.WDS_SOCKET_PORT,
        // Whether or not react-refresh is enabled.
        // It is defined here so it is available in the webpackHotDevClient.
        FAST_REFRESH: process.env.FAST_REFRESH !== 'false',
      }
    );
  // Stringify all values so we can feed into webpack DefinePlugin
  const stringified = {
    'process.env': Object.keys(raw).reduce((env, key) => {
      env[key] = JSON.stringify(raw[key]);
      return env;
    }, {}),
  };

  return { raw, stringified };
}

module.exports = getClientEnvironment;
