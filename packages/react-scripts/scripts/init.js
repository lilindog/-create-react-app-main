// @remove-file-on-eject
/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
'use strict';

/**
 *
 * 1. 按传入的模板名读取node_modules里的模板文件
 * 2. 给项目package.json 部署script命令
 * 3. 给项目package.json 设置browserslist
 * 4. 把template.json -> package字段下的字段拷贝到项目的package.json中（除了dependencies、scripts、。。。外）
 * 5. 拷贝template的文件到项目
 * 6. 追加gitignore, 把模板目录中的gitignore内容追加到项目的.gitignore中去（如果有）
 * 7. 初始化项目git
 * 8. 安装template package.json 中的依赖、开发依赖，以及react、react-dom(如果没有安装的话) 到项目。
 * 9. 如果上一步安装了ts，则执行ts初始化
 * 10. 删除node_modules里边的template包
 * 11. 首次执行提交。
 * 12. 一大堆log提示，然后进程结束。
 *
 *
 */

// Makes the script crash on unhandled rejections instead of silently
// ignoring them. In the future, promise rejections that are not handled will
// terminate the Node.js process with a non-zero exit code.
process.on('unhandledRejection', err => {
  throw err;
});

const fs = require('fs-extra');
const path = require('path');
const chalk = require('react-dev-utils/chalk');
const execSync = require('child_process').execSync;
const spawn = require('react-dev-utils/crossSpawn');
const { defaultBrowsers } = require('react-dev-utils/browsersHelper');
const os = require('os');
const verifyTypeScriptSetup = require('./utils/verifyTypeScriptSetup');

function isInGitRepository() {
  try {
    execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore' });
    return true;
  } catch (e) {
    return false;
  }
}

/** mercurial是另一种版本管理工具 */
function isInmercurialRepository() {
  try {
    execSync('hg --cwd . root', { stdio: 'ignore' });
    return true;
  } catch (e) {
    return false;
  }
}

/** 处于git，mercurial目录中，则返回false； 否则初始化git，返回true */
function tryGitInit() {
  try {
    execSync('git --version', { stdio: 'ignore' });
    if (isInGitRepository() || isInMercurialRepository()) {
      return false;
    }

    execSync('git init', { stdio: 'ignore' });
    return true;
  } catch (e) {
    console.warn('Git repo not initialized', e);
    return false;
  }
}

/** git首次commit */
/** 返回true，失败返回false */
function tryGitCommit(appPath) {
  try {
    execSync('git add -A', { stdio: 'ignore' });
    execSync('git commit -m "Initialize project using Create React App"', {
      stdio: 'ignore',
    });
    return true;
  } catch (e) {
    // We couldn't commit in already initialized git repo,
    // maybe the commit author config is not set.
    // In the future, we might supply our own committer
    // like Ember CLI does, but for now, let's just
    // remove the Git files to avoid a half-done state.
    console.warn('Git commit not created', e);
    console.warn('Removing .git directory...');
    try {
      // unlinkSync() doesn't work on directories.
      fs.removeSync(path.join(appPath, '.git'));
    } catch (removeErr) {
      // Ignore.
    }
    return false;
  }
}

module.exports = function (
    // 传值来自creatr-react-app
    // [
    // root,    项目目录
    // appName, 项目目录名
    // verbose, 布尔值
    // originalDirectory, react-react-app的执行目录，就是项目目录的上一级
    // templateName 模板名，默认为 cra-template
    // ]
  appPath, // 项目目录
  appName, // 项目名
  verbose,
  originalDirectory, // 项目的上一级目录（执行create-react-app的目录）
  templateName // 模板名 默认为 cra-template
) {
  /** 项目package.json 对象 */
  const appPackage = require(path.join(appPath, 'package.json'));

  const useYarn = fs.existsSync(path.join(appPath, 'yarn.lock'));

  /** 没有模板名，直接退出执行 */
  if (!templateName) {
    console.log('');
    console.error(
      `A template was not provided. This is likely because you're using an outdated version of ${chalk.cyan(
        'create-react-app'
      )}.`
    );
    console.error(
      `Please note that global installs of ${chalk.cyan(
        'create-react-app'
      )} are no longer supported.`
    );
    console.error(
      `You can fix this by running ${chalk.cyan(
        'npm uninstall -g create-react-app'
      )} or ${chalk.cyan(
        'yarn global remove create-react-app'
      )} before using ${chalk.cyan('create-react-app')} again.`
    );
    return;
  }

  /** 模板包的绝对路径 */
  const templatePath = path.dirname(
    require.resolve(`${templateName}/package.json`, { paths: [appPath] })
  );

  /** 读取模板包 template.json 文件 */
  const templateJsonPath = path.join(templatePath, 'template.json');
  let templateJson = {};
  if (fs.existsSync(templateJsonPath)) {
    templateJson = require(templateJsonPath);
  }

  /** 模板template.json的package字段 */
  const templatePackage = templateJson.package || {};

  // This was deprecated in CRA v5.
  /** dependencies， scripts 存在于 template.json 则提示弃用。*/
  if (templateJson.dependencies || templateJson.scripts) {
    console.log();
    console.log(
      chalk.red(
        'Root-level `dependencies` and `scripts` keys in `template.json` were deprecated for Create React App 5.\n' +
          'This template needs to be updated to use the new `package` key.'
      )
    );
    console.log('For more information, visit https://cra.link/templates');
  }

  // Keys to ignore in templatePackage
  const templatePackageBlacklist = [
    'name',
    'version',
    'description',
    'keywords',
    'bugs',
    'license',
    'author',
    'contributors',
    'files',
    'browser',
    'bin',
    'man',
    'directories',
    'repository',
    'peerDependencies',
    'bundledDependencies',
    'optionalDependencies',
    'engineStrict',
    'os',
    'cpu',
    'preferGlobal',
    'private',
    'publishConfig',
  ];

  // Keys from templatePackage that will be merged with appPackage
  const templatePackageToMerge = ['dependencies', 'scripts'];

  // Keys from templatePackage that will be added to appPackage,
  // replacing any existing entries.
  const templatePackageToReplace = Object.keys(templatePackage).filter(key => {
    return (
      !templatePackageBlacklist.includes(key) &&
      !templatePackageToMerge.includes(key)
    );
  });

  // Copy over some of the devDependencies
  appPackage.dependencies = appPackage.dependencies || {};

  // Setup the script rules
  const templateScripts = templatePackage.scripts || {};

  /** 给项目package.json 的scripts字段赋值，添加各种脚本命令 */
  appPackage.scripts = Object.assign(
    {
      start: 'react-scripts start',
      build: 'react-scripts build',
      test: 'react-scripts test',
      eject: 'react-scripts eject',
    },
    templateScripts
  );

  // Update scripts for Yarn users
  /** 如果使用了yarn，则要吧脚本的npm run |npm 替换为yarn */
  if (useYarn) {
    appPackage.scripts = Object.entries(appPackage.scripts).reduce(
      (acc, [key, value]) => ({
        ...acc,
        [key]: value.replace(/(npm run |npm )/, 'yarn '),
      }),
      {}
    );
  }

  // Setup the eslint config
  /** 后续研究下这个名为 "react-app" 的eslint配置 */
  appPackage.eslintConfig = {
    extends: 'react-app',
  };

  // Setup the browsers list
  // defaultBrowsers 数据如下
  /*{
      production: ['>0.2%', 'not dead', 'not op_mini all'],
      development: [
        'last 1 chrome version',
        'last 1 firefox version',
        'last 1 safari version',
      ],
    };
  */
  appPackage.browserslist = defaultBrowsers;

  // Add templatePackage keys/values to appPackage, replacing existing entries
  /** 将上面过滤过的template.json中的字段，复制到项目package.json中 */
  /** 不包含 dependencies, scripts 字段 */
  templatePackageToReplace.forEach(key => {
    appPackage[key] = templatePackage[key];
  });

  /** 更新项目的package.json */
  fs.writeFileSync(
    path.join(appPath, 'package.json'),
    JSON.stringify(appPackage, null, 2) + os.EOL
  );

  /**
   * README更名
   */
  const readmeExists = fs.existsSync(path.join(appPath, 'README.md'));
  if (readmeExists) {
    fs.renameSync(
      path.join(appPath, 'README.md'),
      path.join(appPath, 'README.old.md')
    );
  }

  // Copy the files for the user
  /** 模板包中的template模板目录文件夹 */
  const templateDir = path.join(templatePath, 'template');
  /**
   * step5
   *
   * 复制模板的模板文件到项目目录
   * 模板文件不存在则报错退出进程。
   */
  if (fs.existsSync(templateDir)) {
    fs.copySync(templateDir, appPath);
  } else {
    console.error(
      `Could not locate supplied template: ${chalk.green(templateDir)}`
    );
    return;
  }

  // modifies README.md commands based on user used package manager.
  /** 使用yarn时，修改README中的npm字样为yarn */
  if (useYarn) {
    try {
      const readme = fs.readFileSync(path.join(appPath, 'README.md'), 'utf8');
      fs.writeFileSync(
        path.join(appPath, 'README.md'),
        readme.replace(/(npm run |npm )/g, 'yarn '),
        'utf8'
      );
    } catch (err) {
      // Silencing the error. As it fall backs to using default npm commands.
    }
  }

  /**
   * step6
   *
   * 处理项目的.gitignore。
   * .gitignore存在，则吧gitignore追加到.gitignore，然后删除gitignore，仅保留.gitignore。
   * 不存在, 则直接把gitignore重命名为.gitignore。
   */
  const gitignoreExists = fs.existsSync(path.join(appPath, '.gitignore'));
  if (gitignoreExists) {
    // Append if there's already a `.gitignore` file there
    const data = fs.readFileSync(path.join(appPath, 'gitignore'));
    fs.appendFileSync(path.join(appPath, '.gitignore'), data);
    fs.unlinkSync(path.join(appPath, 'gitignore'));
  } else {
    // Rename gitignore after the fact to prevent npm from renaming it to .npmignore
    // See: https://github.com/npm/npm/issues/1862
    fs.moveSync(
      path.join(appPath, 'gitignore'),
      path.join(appPath, '.gitignore'),
      []
    );
  }

  // Initialize git repo
  /** git初始化标志 */
  let initializedGit = false;

  /**
   * step7
   *
   * 尝试初始化git
   */
  if (tryGitInit()) {
    initializedGit     = true;
    console.log();
    console.log('Initialized a git repository.');
  }

  let command;
  let remove;
  let args;

  if (useYarn) {
    command = 'yarnpkg';
    remove = 'remove';
    args = ['add'];
  } else {
    command = 'npm';
    remove = 'uninstall';
    args = [
      'install',
      '--no-audit', // https://github.com/facebook/create-react-app/issues/11174
      '--save',
      verbose && '--verbose',
    ].filter(e => e);
  }

  // Install additional template dependencies, if present.
  /** template.json 中的依赖 [ [key -> value] ] 集合 */
  /** 将这些依赖加入到args中，供后续安装使用 */
  const dependenciesToInstall = Object.entries({
    ...templatePackage.dependencies,
    ...templatePackage.devDependencies,
  });
  if (dependenciesToInstall.length) {
    args = args.concat(
      dependenciesToInstall.map(([dependency, version]) => {
        return `${dependency}@${version}`;
      })
    );
  }

  // Install react and react-dom for backward compatibility with old CRA cli
  // which doesn't install react and react-dom along with react-scripts
  /** 没有安装react, react-dom 的话，记得追加到args里，一起被安装 */
  if (!isReactInstalled(appPackage)) {
    args = args.concat(['react', 'react-dom']);
  }

  // Install template dependencies, and react and react-dom if missing.
  /**
   * step8
   *
   * 安装
   * 若果安装出错，则报错+退出进程。
   */
  if ((!isReactInstalled(appPackage) || templateName) && args.length > 1) {
    console.log();
    console.log(`Installing template dependencies using ${command}...`);

    /** 这里没有指定cwd，应该是以当前进程的cwd为准，请查看启动当前进程的地方来确定cwd */
    const proc = spawn.sync(command, args, { stdio: 'inherit' });
    if (proc.status !== 0) {
      console.error(`\`${command} ${args.join(' ')}\` failed`);
      return;
    }
  }

  /**
   * step9
   *
   * 如果安装命令参数中 包含Typescript 则执行ts初始化检查
   */
  if (args.find(arg => arg.includes('typescript'))) {
    console.log();
    verifyTypeScriptSetup();
  }

  // Remove template
  /**
   * step10
   *
   * 删除npm|yarn安装的模板包，出错则报错+退出进程
   */
  console.log(`Removing template package using ${command}...`);
  console.log();
  const proc = spawn.sync(command, [remove, templateName], {
    stdio: 'inherit',
  });
  if (proc.status !== 0) {
    console.error(`\`${command} ${args.join(' ')}\` failed`);
    return;
  }

  // Create git commit if git repo was initialized
  /**
   * step11
   *
   * 首次commit
   */
  if (initializedGit && tryGitCommit(appPath)) {
    console.log();
    console.log('Created git commit.');
  }

  // Display the most elegant way to cd.
  // This needs to handle an undefined originalDirectory for
  // backward compatibility with old global-cli's.
  /**
   * step12
   *
   * 以下代码 一大堆提示，进程结束
   */
  let cdpath;
  if (originalDirectory && path.join(originalDirectory, appName) === appPath) {
    cdpath = appName;
  } else {
    cdpath = appPath;
  }

  // Change displayed command to yarn instead of yarnpkg
  const displayedCommand = useYarn ? 'yarn' : 'npm';

  console.log();
  console.log(`Success! Created ${appName} at ${appPath}`);
  console.log('Inside that directory, you can run several commands:');
  console.log();
  console.log(chalk.cyan(`  ${displayedCommand} start`));
  console.log('    Starts the development server.');
  console.log();
  console.log(
    chalk.cyan(`  ${displayedCommand} ${useYarn ? '' : 'run '}build`)
  );
  console.log('    Bundles the app into static files for production.');
  console.log();
  console.log(chalk.cyan(`  ${displayedCommand} test`));
  console.log('    Starts the test runner.');
  console.log();
  console.log(
    chalk.cyan(`  ${displayedCommand} ${useYarn ? '' : 'run '}eject`)
  );
  console.log(
    '    Removes this tool and copies build dependencies, configuration files'
  );
  console.log(
    '    and scripts into the app directory. If you do this, you can’t go back!'
  );
  console.log();
  console.log('We suggest that you begin by typing:');
  console.log();
  console.log(chalk.cyan('  cd'), cdpath);
  console.log(`  ${chalk.cyan(`${displayedCommand} start`)}`);
  if (readmeExists) {
    console.log();
    console.log(
      chalk.yellow(
        'You had a `README.md` file, we renamed it to `README.old.md`'
      )
    );
  }
  console.log();
  console.log('Happy hacking!');
};

/** react, react-dom 是否安装 */
function isReactInstalled(appPackage) {
  const dependencies = appPackage.dependencies || {};

  return (
    typeof dependencies.react !== 'undefined' &&
    typeof dependencies['react-dom'] !== 'undefined'
  );
}
