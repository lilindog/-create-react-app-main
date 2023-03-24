/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use strict';

var fs = require('fs');
var path = require('path');
var chalk = require('chalk');

/**
 *
 * 检测文件路径集合是否都存在
 *
 *  * 都存在则返回true
 *  * 只要有一个不存在，则返回false，同事打印警告信息
 *
 */
function checkRequiredFiles(files) {
  var currentFilePath;
  try {
    files.forEach(filePath => {
      currentFilePath = filePath;
      /** 文件是否存在，不存在则抛错 */
      fs.accessSync(filePath, fs.F_OK);
    });
    return true;
  } catch (err) {
    var dirName = path.dirname(currentFilePath);
    var fileName = path.basename(currentFilePath);
    console.log(chalk.red('Could not find a required file.'));
    console.log(chalk.red('  Name: ') + chalk.cyan(fileName));
    console.log(chalk.red('  Searched in: ') + chalk.cyan(dirName));
    return false;
  }
}

module.exports = checkRequiredFiles;
