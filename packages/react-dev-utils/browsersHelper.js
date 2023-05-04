/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
'use strict';

const browserslist = require('browserslist');
const chalk = require('chalk');
const os = require('os');
const prompts = require('prompts');
const pkgUp = require('pkg-up');
const fs = require('fs');

const defaultBrowsers = {
  production: ['>0.2%', 'not dead', 'not op_mini all'],
  development: [
    'last 1 chrome version',
    'last 1 firefox version',
    'last 1 safari version',
  ],
};

/***
 * 在没有找到browserlist配置时询问用户
 * 是否设置，默认返回true（进程处于管道时，非交互时）
 */
function shouldSetBrowsers(isInteractive) {
  if (!isInteractive) {
    return Promise.resolve(true);
  }

  const question = {
    type: 'confirm',
    name: 'shouldSetBrowsers',
    message:
      chalk.yellow("We're unable to detect target browsers.") +
      `\n\nWould you like to add the defaults to your ${chalk.bold(
        'package.json'
      )}?`,
    initial: true,
  };

  return prompts(question).then(answer => answer.shouldSetBrowsers);
}


/**
 * 读取项目目录下的borwserlist配置并返回
 * 没有读取到则写入默认的browserlist配置到pkgjson然后重新读取返回
 */
function checkBrowsers(dir, isInteractive, retry = true) {

  /**
   * 加载项目目录下的 browserlist 信息，
   * 从源码看是从当前项目根目录依次往根目录查找，找到为止；最后还是没找到则返回undefined
   * 每层查找 package.json中的相关字段、browserlist、browserlistrc 中查找，这三个配置方式只能存在一个，否则报错
   * 原码见：https://github.com/browserslist/browserslist/blob/main/node.js#L237
   */
  const current = browserslist.loadConfig({ path: dir });
  /** 找到browser配置立即返回 */
  if (current != null) {
    return Promise.resolve(current);
  }

  /** 不存在，且还不重试，直接返回rejected promise */
  if (!retry) {
    return Promise.reject(
      new Error(
        chalk.red(
          'As of react-scripts >=2 you must specify targeted browsers.'
        ) +
          os.EOL +
          `Please add a ${chalk.underline(
            'browserslist'
          )} key to your ${chalk.bold('package.json')}.`
      )
    );
  }

  /** 询问用户，因为没有在项目找到相应的browserlist配置，是否设置 */
  return shouldSetBrowsers(isInteractive).then(shouldSetBrowsers => {
    /** 用户选择了否，直接重试一遍（就1遍），不出意外大概率进入报错逻辑，根据外部原码判断进程会直接退出 */
    if (!shouldSetBrowsers) {
      return checkBrowsers(dir, isInteractive, false);
    }

    return (


      /** ！又是一个one line package 真tm服了 该包就获取dir下面的package.json的文件的绝对路径 */
      pkgUp({ cwd: dir })
        .then(filePath => {
            /** 没有找到pkg json 那么再次试一遍，不出意外直接进入报错，最后进程退出 */
          if (filePath == null) {
            return Promise.reject();
          }

          /** 使用默认browserlist配置写入到pkgjson里边 */
          const pkg = JSON.parse(fs.readFileSync(filePath));
          pkg['browserslist'] = defaultBrowsers;
          fs.writeFileSync(filePath, JSON.stringify(pkg, null, 2) + os.EOL);

          /** 再试一遍，不出意外，返回从pkg读取到的browserlist配置 */
          browserslist.clearCaches();
          console.log();
          console.log(
            `${chalk.green('Set target browsers:')} ${chalk.cyan(
              defaultBrowsers.join(', ')
            )}`
          );
          console.log();
        })
        // Swallow any error
        .catch(() => {})
        .then(() => checkBrowsers(dir, isInteractive, false))
    );
  });
}

module.exports = { defaultBrowsers, checkBrowsers };
