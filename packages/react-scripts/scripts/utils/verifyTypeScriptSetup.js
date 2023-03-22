// @remove-file-on-eject
/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 *
 *  在init.js中，项目初始化有安装ts模块的时候，会掉用该模块执行ts初始化
 *
 * 1. 生成空的 tsconfig文件（若没有）。
 * 2. 引入ts赋值给命为ts变量，若ts没有安装就报错退出进程。
 * 3. 声明一些基本的ts配置。
 * 4. 使用ts的api读取解析项目的ts配置文件，若出错则直接报错退出进程。
 * 5. 循环基本conpiler配置， 修改读取的tsconfig compiiler 对应的值为基本comiler配置里的suggest或parsedValue || value值
 * 6. 兜底读取的tsconfig里include没有时， 将其赋值为src目录。
 * 7. 打印收集的警告信息，更新项目tsconfig。
 * 8. 若项目中 src/react-app-env.d.ts 文件没有， 则写入三斜线制令引入react-scripts的types类型声明定义 `/// <reference types="react-scripts" />` 。
 *
 */

'use strict';

const chalk = require('react-dev-utils/chalk');
const fs = require('fs');
const resolve = require('resolve');
const path = require('path');
const paths = require('../../config/paths');
const os = require('os');
const semver = require('semver');
const immer = require('react-dev-utils/immer').produce;
const globby = require('react-dev-utils/globby').sync;

/** 是否安装jsx-runtime */
const hasJsxRuntime = (() => {
  if (process.env.DISABLE_NEW_JSX_TRANSFORM === 'true') {
    return false;
  }

  try {
    require.resolve('react/jsx-runtime', { paths: [paths.appPath] });
    return true;
  } catch (e) {
    return false;
  }
})();

/** 就写入json到文件名 */
function writeJson(fileName, object) {
  fs.writeFileSync(
    fileName,
    JSON.stringify(object, null, 2).replace(/\n/g, os.EOL) + os.EOL
  );
}

/** 项目src下没有ts文件返回true，反之返回false并打印警告 */
function verifyNoTypeScript() {
  /** 项目src下的ts文件集合数组 （不包括声明文件，node_modules中的）*/
  const typescriptFiles = globby(
    ['**/*.(ts|tsx)', '!**/node_modules', '!**/*.d.ts'],
    { cwd: paths.appSrc }
  );
  if (typescriptFiles.length > 0) {
    console.warn(
      chalk.yellow(
        `We detected TypeScript in your project (${chalk.bold(
          `src${path.sep}${typescriptFiles[0]}`
        )}) and created a ${chalk.bold('tsconfig.json')} file for you.`
      )
    );
    console.warn();
    return false;
  }
  return true;
}

/**
 * 根据外部调用逻辑，node_modules安装了typescript包，才会走到该函数
 */
function verifyTypeScriptSetup() {
  /** 新增tsconfig文件时赋值为true */
  let firstTimeSetup = false;

  /**
   * step1
   *
   * 生成空的 tsconfig文件（若没有）
   */
  if (!fs.existsSync(paths.appTsConfig)) {
    if (verifyNoTypeScript()) {
      return;
    }
    writeJson(paths.appTsConfig, {});
    firstTimeSetup = true;
  }

  /** 是否有yarn的配置文件 */
  const isYarn = fs.existsSync(paths.yarnLockFile);

  // Ensure typescript is installed
  /**
   * step2
   *
   * 引入typescript, 没有安装的话则报错退出进程
   *
   */
  let ts;
  try {
    // TODO: Remove this hack once `globalThis` issue is resolved
    // https://github.com/jsdom/jsdom/issues/2961

    /** 全局环境 globalThis 是否定义 */
    const globalThisWasDefined = !!global.globalThis;

    /** 加载node_modules里的typescript包主文件 */
    ts = require(resolve.sync('typescript', {
      basedir: paths.appNodeModules,
    }));

    if (!globalThisWasDefined && !!global.globalThis) {
      delete global.globalThis;
    }
  } catch (_) {
    console.error(
      chalk.bold.red(
        `It looks like you're trying to use TypeScript but do not have ${chalk.bold(
          'typescript'
        )} installed.`
      )
    );
    console.error(
      chalk.bold(
        'Please install',
        chalk.cyan.bold('typescript'),
        'by running',
        chalk.cyan.bold(
          isYarn ? 'yarn add typescript' : 'npm install typescript'
        ) + '.'
      )
    );
    console.error(
      chalk.bold(
        'If you are not trying to use TypeScript, please remove the ' +
          chalk.cyan('tsconfig.json') +
          ' file from your package root (and any TypeScript files).'
      )
    );
    console.error();
    process.exit(1);
  }

  /**
   * step3
   *
   * 声明ts compiler 基本配置
   */
  const compilerOptions = {
    // These are suggested values and will be set when not present in the
    // tsconfig.json
    // 'parsedValue' matches the output value from ts.parseJsonConfigFileContent()
    target: {
      parsedValue: ts.ScriptTarget.ES5,
      suggested: 'es5',
    },
    lib: { suggested: ['dom', 'dom.iterable', 'esnext'] },
    allowJs: { suggested: true },
    skipLibCheck: { suggested: true },
    esModuleInterop: { suggested: true },
    allowSyntheticDefaultImports: { suggested: true },
    strict: { suggested: true },
    forceConsistentCasingInFileNames: { suggested: true },
    noFallthroughCasesInSwitch: { suggested: true },

    // These values are required and cannot be changed by the user
    // Keep this in sync with the webpack config
    module: {
      parsedValue: ts.ModuleKind.ESNext,
      value: 'esnext',
      reason: 'for import() and import/export',
    },
    moduleResolution: {
      parsedValue: ts.ModuleResolutionKind.NodeJs,
      value: 'node',
      reason: 'to match webpack resolution',
    },
    resolveJsonModule: { value: true, reason: 'to match webpack loader' },
    isolatedModules: { value: true, reason: 'implementation limitation' },
    noEmit: { value: true },
    jsx: {
      parsedValue:
        hasJsxRuntime && semver.gte(ts.version, '4.1.0-beta')
          ? ts.JsxEmit.ReactJSX
          : ts.JsxEmit.React,
      value:
        hasJsxRuntime && semver.gte(ts.version, '4.1.0-beta')
          ? 'react-jsx'
          : 'react',
      reason: 'to support the new JSX transform in React 17',
    },
    paths: { value: undefined, reason: 'aliased imports are not supported' },
  };

  const formatDiagnosticHost = {
    getCanonicalFileName: fileName => fileName,
    getCurrentDirectory: ts.sys.getCurrentDirectory,
    getNewLine: () => os.EOL,
  };

  const messages = [];

  /**
   * step4
   *
   * 使用ts模块提供的api
   * 读取tsconfig配置 若出错则退出进程
   */
  let appTsConfig; /** 读取项目的整个ts配置文件的json */
  let parsedTsConfig;
  let parsedCompilerOptions; /** 读取项目ts配置文件里的compiler配置项 */
  try {
    const { config: readTsConfig, error } = ts.readConfigFile(
      paths.appTsConfig,
      ts.sys.readFile
    );

    if (error) {
      throw new Error(ts.formatDiagnostic(error, formatDiagnosticHost));
    }

    appTsConfig = readTsConfig;

    // Get TS to parse and resolve any "extends"
    // Calling this function also mutates the tsconfig above,
    // adding in "include" and "exclude", but the compilerOptions remain untouched
    let result;
    parsedTsConfig = immer(readTsConfig, config => {
      result = ts.parseJsonConfigFileContent(
        config,
        ts.sys,
        path.dirname(paths.appTsConfig)
      );
    });

    if (result.errors && result.errors.length) {
      throw new Error(
        ts.formatDiagnostic(result.errors[0], formatDiagnosticHost)
      );
    }

    parsedCompilerOptions = result.options;
  } catch (e) {
    if (e && e.name === 'SyntaxError') {
      console.error(
        chalk.red.bold(
          'Could not parse',
          chalk.cyan('tsconfig.json') + '.',
          'Please make sure it contains syntactically correct JSON.'
        )
      );
    }

    console.log(e && e.message ? `${e.message}` : '');
    process.exit(1);
  }

  /** 读取的tsconig中没有compiler， 则对其赋值为空对象备用 */
  /** firstSetup 设为true */
  if (appTsConfig.compilerOptions == null) {
    appTsConfig.compilerOptions = {};
    firstTimeSetup = true;
  }

  /**
   * step5
   *
   * 循环基本conpiler配置， 修改读取的tsconfig compiiler 对应的值为基本comiler配置里的suggest或parsedValue || value值
   */
  for (const option of Object.keys(compilerOptions)) {
    const { parsedValue, value, suggested, reason } = compilerOptions[option];

    // parsedValue ?? value
    const valueToCheck = parsedValue === undefined ? value : parsedValue;
    // 灰色提示语option名
    const coloredOption = chalk.cyan('compilerOptions.' + option);

    /**
     * 声明的基本compiler配置里面，该项有建议值时；若读取的ts配置里该项没有值， 则赋值为基本compiler配置里的建议值。
     * 并收集警告信息用于后面打印提示用户
     */
    if (suggested != null) {
      if (parsedCompilerOptions[option] === undefined) {
        appTsConfig = immer(appTsConfig, config => {
          config.compilerOptions[option] = suggested;
        });
        /** 收集警告信息 */
        messages.push(
          `${coloredOption} to be ${chalk.bold(
            'suggested'
          )} value: ${chalk.cyan.bold(suggested)} (this can be changed)`
        );
      }
    }
    /**
     * 基本配置compiler里该项没有建议值，且基本compiler配置里该项的值与读取配置里的不一样时，将使用基本compiler配置里的值。
     * 并搜集生成警告信息后面用于打印提示用户
     */
    else if (parsedCompilerOptions[option] !== valueToCheck) {
      appTsConfig = immer(appTsConfig, config => {
        config.compilerOptions[option] = value
      });
      /** 收集警告信息 */
      messages.push(
        `${coloredOption} ${chalk.bold(
          valueToCheck == null ? 'must not' : 'must'
        )} be ${valueToCheck == null ? 'set' : chalk.cyan.bold(value)}` +
          (reason != null ? ` (${reason})` : '')
      );
    }
  }

  // tsconfig will have the merged "include" and "exclude" by this point
  /**
   * step6
   *
   * 缺省 确保tsconfig的include为src目录
   */
  if (parsedTsConfig.include == null) {
    appTsConfig = immer(appTsConfig, config => {
      config.include = ['src'];
    });
    messages.push(
      `${chalk.cyan('include')} should be ${chalk.cyan.bold('src')}`
    );
  }

  /**
   * step7
   *
   * 打印收集的警告信息
   * 更新项目的tsconfig
   */
  if (messages.length > 0) {
    if (firstTimeSetup) {
      console.log(
        chalk.bold(
          'Your',
          chalk.cyan('tsconfig.json'),
          'has been populated with default values.'
        )
      );
      console.log();
    } else {
      console.warn(
        chalk.bold(
          'The following changes are being made to your',
          chalk.cyan('tsconfig.json'),
          'file:'
        )
      );
      messages.forEach(message => {
        console.warn('  - ' + message);
      });
      console.warn();
    }
    writeJson(paths.appTsConfig, appTsConfig);
  }

  // Reference `react-scripts` types
  /** 若项目中 src/react-app-env.d.ts 文件没有 */
  /** 则写入三斜线制令引入react-scripts的types类型声明定义 */
  if (!fs.existsSync(paths.appTypeDeclarations)) {
    fs.writeFileSync(
      paths.appTypeDeclarations,
      `/// <reference types="react-scripts" />${os.EOL}`
    );
  }
}

module.exports = verifyTypeScriptSetup;
