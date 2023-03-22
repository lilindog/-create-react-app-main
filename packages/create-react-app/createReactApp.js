/**
 * 步骤
 *
 * 1. 接收用户命令行参数
 * 2. 对比create-react-app当前版本与线上版本，若小于线上版本，则终止执行。
 * 3. 创建项目目录，写入package.json。
 * 4. 安装react, react-dom, react-scripts, cra-template。
 *    执行安装好的 react-scripts/scripts/init.js，传参： [root, appName, verbose, originalDirectory, templateName]
 *
 */

'use strict';

const https = require('https');
const chalk = require('chalk');
const commander = require('commander');
const dns = require('dns');
const envinfo = require('envinfo');
const execSync = require('child_process').execSync;
const fs = require('fs-extra');
const hyperquest = require('hyperquest');
const prompts = require('prompts');
const os = require('os');
const path = require('path');
const semver = require('semver');
const spawn = require('cross-spawn');
const tmp = require('tmp');
const unpack = require('tar-pack').unpack;
const url = require('url');
const validateProjectName = require('validate-npm-package-name');

const packageJson = require('./package.json');

function isUsingYarn() {
  return (process.env.npm_config_user_agent || '').indexOf('yarn') === 0;
}

let projectName;

function init() {
  /**
   * step1
   *
   * 接收用户命令行参数
   *
   */
  const program = new commander.Command(packageJson.name)
    .version(packageJson.version)
    .arguments('<project-directory>')
    .usage(`${chalk.green('<project-directory>')} [options]`)
    .action(name => {
      projectName = name;
    })
    .option('--verbose', 'print additional logs')
    .option('--info', 'print environment debug info')
    .option(
      '--scripts-version <alternative-package>',
      'use a non-standard version of react-scripts'
    )
    .option(
      '--template <path-to-template>',
      'specify a template for the created project'
    )
    .option('--use-pnp')
    .allowUnknownOption()
    .on('--help', () => {
      console.log(
        `    Only ${chalk.green('<project-directory>')} is required.`
      );
      console.log();
      console.log(
        `    A custom ${chalk.cyan('--scripts-version')} can be one of:`
      );
      console.log(`      - a specific npm version: ${chalk.green('0.8.2')}`);
      console.log(`      - a specific npm tag: ${chalk.green('@next')}`);
      console.log(
        `      - a custom fork published on npm: ${chalk.green(
          'my-react-scripts'
        )}`
      );
      console.log(
        `      - a local path relative to the current working directory: ${chalk.green(
          'file:../my-react-scripts'
        )}`
      );
      console.log(
        `      - a .tgz archive: ${chalk.green(
          'https://mysite.com/my-react-scripts-0.8.2.tgz'
        )}`
      );
      console.log(
        `      - a .tar.gz archive: ${chalk.green(
          'https://mysite.com/my-react-scripts-0.8.2.tar.gz'
        )}`
      );
      console.log(
        `    It is not needed unless you specifically want to use a fork.`
      );
      console.log();
      console.log(`    A custom ${chalk.cyan('--template')} can be one of:`);
      console.log(
        `      - a custom template published on npm: ${chalk.green(
          'cra-template-typescript'
        )}`
      );
      console.log(
        `      - a local path relative to the current working directory: ${chalk.green(
          'file:../my-custom-template'
        )}`
      );
      console.log(
        `      - a .tgz archive: ${chalk.green(
          'https://mysite.com/my-custom-template-0.8.2.tgz'
        )}`
      );
      console.log(
        `      - a .tar.gz archive: ${chalk.green(
          'https://mysite.com/my-custom-template-0.8.2.tar.gz'
        )}`
      );
      console.log();
      console.log(
        `    If you have any problems, do not hesitate to file an issue:`
      );
      console.log(
        `      ${chalk.cyan(
          'https://github.com/facebook/create-react-app/issues/new'
        )}`
      );
      console.log();
    })
    .parse(process.argv);

  if (program.info) {
    console.log(chalk.bold('\nEnvironment Info:'));
    console.log(
      `\n  current version of ${packageJson.name}: ${packageJson.version}`
    );
    console.log(`  running from ${__dirname}`);
    return envinfo
      .run(
        {
          System: ['OS', 'CPU'],
          Binaries: ['Node', 'npm', 'Yarn'],
          Browsers: [
            'Chrome',
            'Edge',
            'Internet Explorer',
            'Firefox',
            'Safari',
          ],
          npmPackages: ['react', 'react-dom', 'react-scripts'],
          npmGlobalPackages: ['create-react-app'],
        },
        {
          duplicates: true,
          showNotFound: true,
        }
      )
      .then(console.log);
  }

  if (typeof projectName === 'undefined') {
    console.error('Please specify the project directory:');
    console.log(
      `  ${chalk.cyan(program.name())} ${chalk.green('<project-directory>')}`
    );
    console.log();
    console.log('For example:');
    console.log(
      `  ${chalk.cyan(program.name())} ${chalk.green('my-react-app')}`
    );
    console.log();
    console.log(
      `Run ${chalk.cyan(`${program.name()} --help`)} to see all options.`
    );
    process.exit(1);
  }

  // We first check the registry directly via the API, and if that fails, we try
  // the slower `npm view [package] version` command.
  //
  // This is important for users in environments where direct access to npm is
  // blocked by a firewall, and packages are provided exclusively via a private
  // registry.

  /**
   *
   * step2
   *
   * 检查create-react-app当前版本与线上版本，若小于线上版本，则终止执行。
   *
   *
   */
  checkForLatestVersion()
    .catch(() => {
      try {
        return execSync('npm view create-react-app version').toString().trim();
      } catch (e) {
        return null;
      }
    })
    .then(latest => {
      if (latest && semver.lt(packageJson.version, latest)) {
        console.log();
        console.error(
          chalk.yellow(
            `You are running \`create-react-app\` ${packageJson.version}, which is behind the latest release (${latest}).\n\n` +
              'We recommend always using the latest version of create-react-app if possible.'
          )
        );
        console.log();
        console.log(
          'The latest instructions for creating a new app can be found here:\n' +
            'https://create-react-app.dev/docs/getting-started/'
        );
        console.log();
      } else {
        const useYarn = isUsingYarn();
        createApp(
          projectName,
          program.verbose,
          program.scriptsVersion,
          program.template,
          useYarn,
          program.usePnp
        );
      }
    });
}

/***
 *
 * step3
 *
 * 创建项目目录文件夹，写入package.json文件
 *
 */
function createApp(name, verbose, version, template, useYarn, usePnp) {
  const unsupportedNodeVersion = !semver.satisfies(
    // Coerce strings with metadata (i.e. `15.0.0-nightly`).
    semver.coerce(process.version),
    '>=14'
  );
  /** node版本小于14，则重置version=react-scripts@0.9.x （就是命令行传入的--scripts-version）*/
  if (unsupportedNodeVersion) {
    console.log(
      chalk.yellow(
        `You are using Node ${process.version} so the project will be bootstrapped with an old unsupported version of tools.\n\n` +
          `Please update to Node 14 or higher for a better, fully supported experience.\n`
      )
    );
    // Fall back to latest supported react-scripts on Node 4
    version = 'react-scripts@0.9.x';
  }

  const root = path.resolve(name); // 当前目录+项目名 绝对地址
  const appName = path.basename(root); // 项目名

  /** 创建项目目录 */
  checkAppName(appName); // 检查project名字是否能合法，不合法就退出脚本
  fs.ensureDirSync(name); // 创建项目目录（以项目名命名）

  /** 目录中有文件，不是干净的目录，则退出脚本 */
  if (!isSafeToCreateProjectIn(root, name)) {
    process.exit(1);
  }
  console.log();

  console.log(`Creating a new React app in ${chalk.green(root)}.`);
  console.log();

  /** 生成基本package.json */
  const packageJson = {
    name: appName,
    version: '0.1.0',
    private: true,
  };
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify(packageJson, null, 2) + os.EOL
  );

  const originalDirectory = process.cwd();
  /** ！！！注意，切换脚本工作目录到当前项目目录里（原cwd + 项目名 的路径） */
  process.chdir(root);

  /**
   * 没有使用yarn而 且 npm config list 的 cwd不等于当前脚本的cwd时，则退出脚本
   * 意图尚不清楚，猜测可能是不适用yarn必然使用npm，而使用npm则要求npm的cwd必须与当前脚本的cwd相同
   */
  if (!useYarn && !checkThatNpmCanReadCwd()) {
    process.exit(1);
  }

  /** npm版本小于6.0 则打印警告信息，然后重置version */
  if (!useYarn) {
    const npmInfo = checkNpmVersion();
    if (!npmInfo.hasMinNpm) { // npm版本小于6.0.0
      // npm不满足最小版本则打印警告信息，然后重置version
      if (npmInfo.npmVersion) {
        console.log(
          chalk.yellow(
            `You are using npm ${npmInfo.npmVersion} so the project will be bootstrapped with an old unsupported version of tools.\n\n` +
              `Please update to npm 6 or higher for a better, fully supported experience.\n`
          )
        );
      }
      // Fall back to latest supported react-scripts for npm 3
      // 再次重置version，也就是那个npm pack构建的脚本路径被重置
      // 前一次重置实在node版本检测低于14的时候
      version = 'react-scripts@0.9.x';
    }
  }
  // 使用usePnp时，若yarn版本不符合规定，那么不适用pnp （即usepNP = FALSE）
  else if (usePnp) {
    const yarnInfo = checkYarnVersion();
    if (yarnInfo.yarnVersion) {
      if (!yarnInfo.hasMinYarnPnp) {
        console.log(
          chalk.yellow(
            `You are using Yarn ${yarnInfo.yarnVersion} together with the --use-pnp flag, but Plug'n'Play is only supported starting from the 1.12 release.\n\n` +
              `Please update to Yarn 1.12 or higher for a better, fully supported experience.\n`
          )
        );
        // 1.11 had an issue with webpack-dev-middleware, so better not use PnP with it (never reached stable, but still)
        usePnp = false;
      }
      if (!yarnInfo.hasMaxYarnPnp) {
        console.log(
          chalk.yellow(
            'The --use-pnp flag is no longer necessary with yarn 2 and will be deprecated and removed in a future release.\n'
          )
        );
        // 2 supports PnP by default and breaks when trying to use the flag
        usePnp = false;
      }
    }
  }

  run(
    root,
    appName,
    version, // 可能是修改过的 兜底的0.9.x版本
    verbose, // 命令行直传
    originalDirectory, // 当前脚本工作目录
    template, // 命令行直传
    useYarn, // 命令行直传
    usePnp // 可能修改过
  );
}

/** 安装dependencies数组里的包, 不返回东西, 报错会被全局错误处理捕获 */
function install(root, useYarn, usePnp, dependencies, verbose, isOnline) {
  return new Promise((resolve, reject) => {
    let command;
    let args;
    // 使用yarn，usePnp参数在使用yarn时候才有意义
    if (useYarn) {
      command = 'yarnpkg';
      args = ['add', '--exact'];
      if (!isOnline) {
        args.push('--offline');
      }
      if (usePnp) {
        args.push('--enable-pnp');
      }
      [].push.apply(args, dependencies);

      // Explicitly set cwd() to work around issues like
      // https://github.com/facebook/create-react-app/issues/3326.
      // Unfortunately we can only do this for Yarn because npm support for
      // equivalent --prefix flag doesn't help with this issue.
      // This is why for npm, we run checkThatNpmCanReadCwd() early instead.
      args.push('--cwd');
      args.push(root);

      if (!isOnline) {
        console.log(chalk.yellow('You appear to be offline.'));
        console.log(chalk.yellow('Falling back to the local Yarn cache.'));
        console.log();
      }
    }
    // 使用npm
    else {
      command = 'npm';
      args = [
        'install',
        '--no-audit', // https://github.com/facebook/create-react-app/issues/11174
        '--save',
        '--save-exact',
        '--loglevel',
        'error',
      ].concat(dependencies);

      if (usePnp) {
        console.log(chalk.yellow("NPM doesn't support PnP."));
        console.log(chalk.yellow('Falling back to the regular installs.'));
        console.log();
      }
    }

    if (verbose) {
      args.push('--verbose');
    }

    const child = spawn(command, args, { stdio: 'inherit' });
    child.on('close', code => {
      if (code !== 0) {
        reject({
          command: `${command} ${args.join(' ')}`,
        });
        return;
      }
      resolve();
    });
  });
}


/*
root, // 项目目录绝对地址
appName, // 项目名
version, // 可能是修改过的，可能是npm pack打包的脚本名字或 react-scripts@0.9.x
verbose, // 命令行直传
originalDirectory, // 当前项目（project-name）的父级目录
template, // 命令行直传
useYarn, // 命令行直传
usePnp // 可能修改过
*/
/**
 * step4
 *
 * 在项目目录中安装依赖：react', 'react-dom', react-scripts(缺省默认), cra-template（缺省默认）
 * 执行 react-scripts（缺省默认） 的init方法，传入指定参数
 *
 */
function run(
  root,
  appName,
  version,
  verbose,
  originalDirectory,
  template,
  useYarn,
  usePnp
) {
  Promise.all([
    getInstallPackage(version, originalDirectory), // version 命令行没有指定值时候返回 "react-scripts"
    getTemplateInstallPackage(template, originalDirectory), // template 命令没有指定时返回 "cra-template"
  ]).then(([packageToInstall, templateToInstall]) => {
    // packageToInstall = npm pack 打包后的文件地址,
    // templateToInstall = 默认没有，假想为用户命令行赋值typescript ，缺省默认值 cra-template
    const allDependencies = ['react', 'react-dom', packageToInstall /* react-scripts */];

    console.log('Installing packages. This might take a couple of minutes.');

    Promise.all([
      getPackageInfo(packageToInstall), // { name: 'react-scripts' }
      getPackageInfo(templateToInstall), // { name: 'cra-template' }
    ])
      .then(([packageInfo, templateInfo]) =>
        checkIfOnline(useYarn) // 没有用yarn 直接返回true
          .then(isOnline => ({
            isOnline,
            packageInfo,
            templateInfo,
          }))
      )
      /**
       * 此then块负责 安装依赖：react', 'react-dom', react-scripts(缺省默认), cra-template（缺省默认）
       */
      .then(({ isOnline, packageInfo, templateInfo }) => {
        /** --script-version 指定包 的 版本号，如：1.2.3 */
        let packageVersion = semver.coerce(packageInfo.version);

        /** 模板包 的 限制最小版本号 */
        const templatesVersionMinimum = '3.3.0';

        // Assume compatibility if we can't test the version.
        if (!semver.valid(packageVersion)) {
          packageVersion = templatesVersionMinimum;
        }

        // Only support templates when used alongside new react-scripts versions.
        /** --scripts-version 版本与--temnplate 版本检测ok后，追加template到 安装参数  */
        const supportsTemplates = semver.gte(
          packageVersion,
          templatesVersionMinimum
        );
        if (supportsTemplates) {
          allDependencies.push(templateToInstall); // packageInfo 没有版本号，或者版本号大于等于指定版本号，才把templat安装压入依赖数组，否则弹出提示并略过
        } else if (template) {
          console.log('');
          console.log(
            `The ${chalk.cyan(packageInfo.name)} version you're using ${
              packageInfo.name === 'react-scripts' ? 'is not' : 'may not be'
            } compatible with the ${chalk.cyan('--template')} option.`
          );
          console.log('');
        }

        /** 提示开始安装了 */
        console.log(
          `Installing ${chalk.cyan('react')}, ${chalk.cyan(
            'react-dom'
          )}, and ${chalk.cyan(packageInfo.name)}${
            supportsTemplates ? ` with ${chalk.cyan(templateInfo.name)}` : ''
          }...`
        );
        console.log();

        /** 安装allDependencies中的所有模块，不返回值 */
        return install(
          root,
          useYarn,
          usePnp,
          allDependencies, // ['react', 'react-dom', packageToInstall [,templateToInstall] ];
          verbose,
          isOnline
        ).then(() => ({
          packageInfo,
          supportsTemplates,
          templateInfo,
        }));
      })

      /**
       * 以下下逻辑就是整个进程结束的逻辑了
       */
      .then(async ({ packageInfo, supportsTemplates, templateInfo }) => {
        const packageName = packageInfo.name;
        const templateName = supportsTemplates ? templateInfo.name : undefined;
        // 检测包版本是否与当前node版本兼容，否则退出进程
        checkNodeVersion(packageName);
        // 检测依赖包是否存在于新建项目的json dependencies中, 否测退出进程
        setCaretRangeForRuntimeDeps(packageName);

        const pnpPath = path.resolve(process.cwd(), '.pnp.js');

        const nodeArgs = fs.existsSync(pnpPath) ? ['--require', pnpPath] : [];
        
        // 运行react-scripts init 文件的方法，传入参数
        await executeNodeScript(
          {
            cwd: process.cwd(), /** 执行 init.js的cwd位当前项目目录 */
            args: nodeArgs,
          },
          [root, appName, verbose, originalDirectory, templateName], // react-scripts init文件执行这些参数
          `
        const init = require('${packageName}/scripts/init.js');
        init.apply(null, JSON.parse(process.argv[1]));
      `
        );

        // 旧版本scripts温馨提示，建议用户升级版本
        if (version === 'react-scripts@0.9.x') {
          console.log(
            chalk.yellow(
              `\nNote: the project was bootstrapped with an old unsupported version of tools.\n` +
                `Please update to Node >=14 and npm >=6 to get supported tools in new projects.\n`
            )
          );
        }
      })
      .catch(reason => {
        console.log();
        console.log('Aborting installation.');
        if (reason.command) {
          console.log(`  ${chalk.cyan(reason.command)} has failed.`);
        } else {
          console.log(
            chalk.red('Unexpected error. Please report it as a bug:')
          );
          console.log(reason);
        }
        console.log();

        // On 'exit' we will delete these files from target directory.
        const knownGeneratedFiles = ['package.json', 'node_modules'];
        const currentFiles = fs.readdirSync(path.join(root));
        // 报错，删除文件
        currentFiles.forEach(file => {
          knownGeneratedFiles.forEach(fileToMatch => {
            // This removes all knownGeneratedFiles.
            if (file === fileToMatch) {
              console.log(`Deleting generated file... ${chalk.cyan(file)}`);
              fs.removeSync(path.join(root, file));
            }
          });
        });
        const remainingFiles = fs.readdirSync(path.join(root));
        if (!remainingFiles.length) {
          // Delete target folder if empty
          console.log(
            `Deleting ${chalk.cyan(`${appName}/`)} from ${chalk.cyan(
              path.resolve(root, '..')
            )}`
          );
          /** 还回进程的工作目录 */
          process.chdir(path.resolve(root, '..'));
          fs.removeSync(path.join(root));
        }
        console.log('Done.');
        process.exit(1);
      });
  });
}

/**
 * version 为版本时（如：2.3.4）返回 "react-scripts@2.3.4"
 * version 为@版本时（如：@2.3.4）返回 "react-scripts@2.3.4"
 * version 为file:开头时（如：file:./test）返回 "上级目录绝对地址+test"
 * 其他直接返回 "version传入值"
 *
 * 若没有传入version，则返回默认的 "react-scripts"
 *
 */
function getInstallPackage(
    version, originalDirectory
) {
  let packageToInstall = 'react-scripts';
  const validSemver = semver.valid(version);
  // 是包版本号时
  if (validSemver) {
    packageToInstall += `@${validSemver}`;
  } else if (version) {
    if (version[0] === '@' && !version.includes('/')) {
      packageToInstall += version;
    } else if (version.match(/^file:/)) { // 本地路径
      packageToInstall = `file:${path.resolve(
        originalDirectory,
        version.match(/^file:(.*)?$/)[1]
      )}`;
    } else {
      // for tar.gz or alternative paths
      // 是npm pack打包地址
      packageToInstall = version; // 正常情况下，这里是最初npm pack打包的产物的绝对地址 或者 react-scripts@0.9.x
    }
  }

  // 废弃警告脚本集合
  const scriptsToWarn = [
    {
      name: 'react-scripts-ts',
      message: chalk.yellow(
        `The react-scripts-ts package is deprecated. TypeScript is now supported natively in Create React App. You can use the ${chalk.green(
          '--template typescript'
        )} option instead when generating your app to include TypeScript support. Would you like to continue using react-scripts-ts?`
      ),
    },
  ];

  // 若packageToInstall处于废弃警告脚本中，那么，询问用户，用户选择选择是则返回true，否则退出脚本
  for (const script of scriptsToWarn) {
    if (packageToInstall.startsWith(script.name)) {
      return prompts({
        type: 'confirm',
        name: 'useScript',
        message: script.message,
        initial: false,
      }).then(answer => {
        if (!answer.useScript) {
          process.exit(0);
        }
        return packageToInstall;
      });
    }
  }

  // 不在废弃脚本集合中，直接返回脚本地址（正常是最初npm pack打包的产物的绝对地址）
  return Promise.resolve(packageToInstall);
}

/**
 * template 无值时，返回 "cra-template"
 * teamplte 为file：xx时，返回 "上级目录 + xx"
 * template 含有://或后缀为.gz时，返回template传入值
 * 其他：
 *    template 传入值为 @scope/name@x.x.x
 *
 *    template name部分等于cra-template或前缀为 cra-template- 时，返回@scope/name@x.x.x | name@x.x.x
 *    template 等于 "@x.x.x" 时， 返回 "@x.x.x/cra-template"
 *    template 为 普通ascii字符时， 返回 "cra-template-<ascii字符>"
 *
 *    template 没有传入时候，返回默认的 "cra-template"
 *
 */
function getTemplateInstallPackage(template /* 模板名来自命令行直传，中途没有修改，可能无值， 无值返回cra-template */, originalDirectory /* 就是当前项目的上一级目录 */) {

  let templateToInstall = 'cra-template'; // 默认模板名，命令行没有给模板名参数，则返回这个默认的

  if (template) {
    if (template.match(/^file:/)) { // 本地相对路径，就拼接成绝对路径
      templateToInstall = `file:${path.resolve(
        originalDirectory,
        template.match(/^file:(.*)?$/)[1]
      )}`;
    } else if (
      template.includes('://') ||
      template.match(/^.+\.(tgz|tar\.gz)$/) // 最初npm pack打包的 脚本名字
    ) {
      // for tar.gz or alternative paths
      templateToInstall = template;
    } else {
      // Add prefix 'cra-template-' to non-prefixed templates, leaving any
      // @scope/ and @version intact.
      const packageMatch = template.match(/^(@[^/]+\/)?([^@]+)?(@.+)?$/);
      const scope = packageMatch[1] || '';
      const templateName = packageMatch[2] || '';
      const version = packageMatch[3] || '';

      if (
        templateName === templateToInstall ||
        templateName.startsWith(`${templateToInstall}-`)
      ) {
        // Covers:
        // - cra-template
        // - @SCOPE/cra-template
        // - cra-template-NAME
        // - @SCOPE/cra-template-NAME
        templateToInstall = `${scope}${templateName}${version}`;
      } else if (version && !scope && !templateName) {
        // Covers using @SCOPE only
        templateToInstall = `${version}/${templateToInstall}`;
      } else {
        // Covers templates without the `cra-template` prefix:
        // - NAME
        // - @SCOPE/NAME
        templateToInstall = `${scope}${templateToInstall}-${templateName}${version}`; // 若用户指定模板为 typescript ，则这里返回为 cra-template-typescript
      }
    }
  }

  return Promise.resolve(templateToInstall);
}

/**
 * 创建临时目录
 *
 * 返回: {
 *        tmdir: ,
 *        cleanup: ()=> {}
 *      }
 */
function getTemporaryDirectory() {
  return new Promise((resolve, reject) => {
    // Unsafe cleanup lets us recursively delete the directory if it contains
    // contents; by default it only allows removal if it's empty
    tmp.dir({ unsafeCleanup: true }, (err, tmpdir, callback) => {
      if (err) {
        reject(err);
      } else {
        resolve({
          tmpdir: tmpdir,
          cleanup: () => {
            try {
              callback();
            } catch (ignored) {
              // Callback might throw and fail, since it's a temp directory the
              // OS will clean it up eventually...
            }
          },
        });
      }
    });
  });
}

function extractStream(stream, dest) {
  return new Promise((resolve, reject) => {
    stream.pipe(
      unpack(dest, err => {
        if (err) {
          reject(err);
        } else {
          resolve(dest);
        }
      })
    );
  });
}

// Extract package name from tarball url or path.
/**
 * 返回包名和版本号 { name: string, version?: string }
 *
 * 参数为 gz 压缩文件时，解压到临时目录中，加载其package.json中的name和version 返回
 * 参数为git+链接，则返回git+连接中的name： { name: stirng }
 * 参数为：file: path时， 加载path的package.json ，返回其name与version： { name: string, version: string }
 * 参数为： @scope/name@version | name@version 时， 返回： { name: @scope/name | name, version: @version }
 *
 * 其他：
 *    返回传入值
 */
function getPackageInfo(installPackage) {

  // 后缀为gz的压缩文件
  // 下载、拷贝包到临时目录，然后读取其package.json中的报名+版本信息返回
  // 出错，直接返回传入的名字（去除后缀部分）
  if (installPackage.match(/^.+\.(tgz|tar\.gz)$/)) {
    return getTemporaryDirectory()
        // 创建文件流写入临时目录
        // 继续返回临时目录信息
      .then(obj => {
        let stream;
        if (/^http/.test(installPackage)) {
          stream = hyperquest(installPackage); // 远程
        } else {
          stream = fs.createReadStream(installPackage); // 本地
        }
        return extractStream(stream, obj.tmpdir).then(() => obj);
      })
        // 读取上一步赋值到临时目录里的版本号、包名返回，
        // 同时清空临时目录
      .then(obj => {
        const { name, version } = require(path.join(
          obj.tmpdir,
          'package.json'
        ));
        obj.cleanup();
        return { name, version };
      })
      .catch(err => {
        // The package name could be with or without semver version, e.g. react-scripts-0.2.0-alpha.1.tgz
        // However, this function returns package name only without semver version.
        console.log(
          `Could not extract the package name from the archive: ${err.message}`
        );
        const assumedProjectName = installPackage.match(
          /^.+\/(.+?)(?:-\d+.+)?\.(tgz|tar\.gz)$/
        )[1];
        console.log(
          `Based on the filename, assuming it is "${chalk.cyan(
            assumedProjectName
          )}"`
        );
        return Promise.resolve({ name: assumedProjectName });
      });
  }
  // git+链接，直接返回包名（去除.git后缀）
  else if (installPackage.startsWith('git+')) {
    // Pull package name out of git urls e.g:
    // git+https://github.com/mycompany/react-scripts.git
    // git+ssh://github.com/mycompany/react-scripts.git#v1.2.3
    return Promise.resolve({
      name: installPackage.match(/([^/]+)\.git(#.*)?$/)[1],
    });
  }
  // npm 包名 如：@scope/name@version
  // 读取name、@version返回
  else if (installPackage.match(/.+@/)) {
    // Do not match @scope/ when stripping off @version or @tag
    return Promise.resolve({
      name: installPackage.charAt(0) + installPackage.substr(1).split('@')[0], // @scope/name | name
      version: installPackage.split('@')[1], // @version 包名后面的版本号
    });
  }
  // file：path 本地相对地址
  // 读取他的package.json中的name、version返回
  else if (installPackage.match(/^file:/)) {
    const installPackagePath = installPackage.match(/^file:(.*)?$/)[1];
    const { name, version } = require(path.join(
      installPackagePath,
      'package.json'
    ));
    return Promise.resolve({ name, version });
  }
  // 啥都没匹配，直接返回name ：传入值
  return Promise.resolve({ name: installPackage });
}

function checkNpmVersion() {
  let hasMinNpm = false;
  let npmVersion = null;
  try {
    // npm版本大于等于6.0.0
    npmVersion = execSync('npm --version').toString().trim();
    hasMinNpm = semver.gte(npmVersion, '6.0.0');
  } catch (err) {
    // ignore
  }
  return {
    hasMinNpm: hasMinNpm,
    npmVersion: npmVersion,
  };
}

function checkYarnVersion() {
  const minYarnPnp = '1.12.0';
  const maxYarnPnp = '2.0.0';
  let hasMinYarnPnp = false;
  let hasMaxYarnPnp = false;
  let yarnVersion = null;
  try {
    yarnVersion = execSync('yarnpkg --version').toString().trim();
    if (semver.valid(yarnVersion)) {
      hasMinYarnPnp = semver.gte(yarnVersion, minYarnPnp);
      hasMaxYarnPnp = semver.lt(yarnVersion, maxYarnPnp);
    } else {
      // Handle non-semver compliant yarn version strings, which yarn currently
      // uses for nightly builds. The regex truncates anything after the first
      // dash. See #5362.
      const trimmedYarnVersionMatch = /^(.+?)[-+].+$/.exec(yarnVersion);
      if (trimmedYarnVersionMatch) {
        const trimmedYarnVersion = trimmedYarnVersionMatch.pop();
        hasMinYarnPnp = semver.gte(trimmedYarnVersion, minYarnPnp);
        hasMaxYarnPnp = semver.lt(trimmedYarnVersion, maxYarnPnp);
      }
    }
  } catch (err) {
    // ignore
  }
  return {
    hasMinYarnPnp: hasMinYarnPnp,
    hasMaxYarnPnp: hasMaxYarnPnp,
    yarnVersion: yarnVersion,
  };
}

/**
 * 检查当前node版本是否符合node_modules安装的包的node版本要求
 * 正常返回undefined，异常则报错退出脚本
 */
function checkNodeVersion(packageName) {
  const packageJsonPath = path.resolve(
    process.cwd(),
    'node_modules',
    packageName,
    'package.json'
  );

  if (!fs.existsSync(packageJsonPath)) {
    return;
  }

  const packageJson = require(packageJsonPath);
  if (!packageJson.engines || !packageJson.engines.node) {
    return;
  }

  if (!semver.satisfies(process.version, packageJson.engines.node)) {
    console.error(
      chalk.red(
        'You are running Node %s.\n' +
          'Create React App requires Node %s or higher. \n' +
          'Please update your version of Node.'
      ),
      process.version,
      packageJson.engines.node
    );
    process.exit(1);
  }
}

function checkAppName(appName) {
  const validationResult = validateProjectName(appName);
  if (!validationResult.validForNewPackages) {
    console.error(
      chalk.red(
        `Cannot create a project named ${chalk.green(
          `"${appName}"`
        )} because of npm naming restrictions:\n`
      )
    );
    [
      ...(validationResult.errors || []),
      ...(validationResult.warnings || []),
    ].forEach(error => {
      console.error(chalk.red(`  * ${error}`));
    });
    console.error(chalk.red('\nPlease choose a different project name.'));
    process.exit(1);
  }

  // TODO: there should be a single place that holds the dependencies
  const dependencies = ['react', 'react-dom', 'react-scripts'].sort();
  if (dependencies.includes(appName)) {
    console.error(
      chalk.red(
        `Cannot create a project named ${chalk.green(
          `"${appName}"`
        )} because a dependency with the same name exists.\n` +
          `Due to the way npm works, the following names are not allowed:\n\n`
      ) +
        chalk.cyan(dependencies.map(depName => `  ${depName}`).join('\n')) +
        chalk.red('\n\nPlease choose a different project name.')
    );
    process.exit(1);
  }
}

function makeCaretRange(dependencies, name) {
  const version = dependencies[name];

  if (typeof version === 'undefined') {
    console.error(chalk.red(`Missing ${name} dependency in package.json`));
    process.exit(1);
  }

  let patchedVersion = `^${version}`;

  if (!semver.validRange(patchedVersion)) {
    console.error(
      `Unable to patch ${name} dependency version because version ${chalk.red(
        version
      )} will become invalid ${chalk.red(patchedVersion)}`
    );
    patchedVersion = version;
  }

  dependencies[name] = patchedVersion;
}

// 检测指定的包名是否存在于dependencies中，不存在则退出进程
// 存在则继续处理，把react,react-dom 的依赖变为大版本限制 如： `^x.x.x`
function setCaretRangeForRuntimeDeps(packageName) {
  // 加载项目的package.json文件
  const packagePath = path.join(process.cwd(), 'package.json');
  const packageJson = require(packagePath);

  // 项目json没有dependencies 字段则退出进程
  if (typeof packageJson.dependencies === 'undefined') {
    console.error(chalk.red('Missing dependencies in package.json'));
    process.exit(1);
  }

  // 项目dependencies赖项中没有包含制定包名，则退出进程
  const packageVersion = packageJson.dependencies[packageName];
  if (typeof packageVersion === 'undefined') {
    console.error(chalk.red(`Unable to find ${packageName} in package.json`));
    process.exit(1);
  }

  makeCaretRange(packageJson.dependencies, 'react');
  makeCaretRange(packageJson.dependencies, 'react-dom');

  fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + os.EOL);
}

// If project only contains files generated by GH, it’s safe.
// Also, if project contains remnant error logs from a previous
// installation, lets remove them now.
// We also special case IJ-based products .idea because it integrates with CRA:
// https://github.com/facebook/create-react-app/pull/368#issuecomment-243446094
// 检查目录中是否有多余的文件，没有则清空返回true，有则弹出警告返回false。 （配置文件，错误日志文件除外）
function isSafeToCreateProjectIn(root, name) {
  const validFiles = [
    '.DS_Store',
    '.git',
    '.gitattributes',
    '.gitignore',
    '.gitlab-ci.yml',
    '.hg',
    '.hgcheck',
    '.hgignore',
    '.idea',
    '.npmignore',
    '.travis.yml',
    'docs',
    'LICENSE',
    'README.md',
    'mkdocs.yml',
    'Thumbs.db',
  ];
  // These files should be allowed to remain on a failed install, but then
  // silently removed during the next create.
  const errorLogFilePatterns = [
    'npm-debug.log',
    'yarn-error.log',
    'yarn-debug.log',
  ];
  const isErrorLog = file => {
    return errorLogFilePatterns.some(pattern => file.startsWith(pattern));
  };

  /** 当前目录下，除了错误日志、配置文件以外的文件集合 */
  const conflicts = fs
    .readdirSync(root)
    .filter(file => !validFiles.includes(file))
    // IntelliJ IDEA creates module files before CRA is launched
    .filter(file => !/\.iml$/.test(file))
    // Don't treat log files from previous installation as conflicts
    .filter(file => !isErrorLog(file));

  /** 目录中有除了配置文件、错误日志以外的文件，则返回false */
  if (conflicts.length > 0) {
    console.log(
      `The directory ${chalk.green(name)} contains files that could conflict:`
    );
    console.log();
    for (const file of conflicts) {
      try {
        const stats = fs.lstatSync(path.join(root, file));
        if (stats.isDirectory()) {
          console.log(`  ${chalk.blue(`${file}/`)}`);
        } else {
          console.log(`  ${file}`);
        }
      } catch (e) {
        console.log(`  ${file}`);
      }
    }
    console.log();
    console.log(
      'Either try using a new directory name, or remove the files listed above.'
    );

    return false;
  }

  // Remove any log files from a previous installation.
  /**
   * 目录中很干净，返回true
   *
   * 顺带清空错误日志文件
   */
  fs.readdirSync(root).forEach(file => {
    if (isErrorLog(file)) {
      fs.removeSync(path.join(root, file));
    }
  });
  return true;
}

function getProxy() {
  if (process.env.https_proxy) {
    return process.env.https_proxy;
  } else {
    try {
      // Trying to read https-proxy from .npmrc
      let httpsProxy = execSync('npm config get https-proxy').toString().trim();
      return httpsProxy !== 'null' ? httpsProxy : undefined;
    } catch (e) {
      return;
    }
  }
}

// See https://github.com/facebook/create-react-app/pull/3355
// 执行npm condig list 返回的cwd与当前脚本的cwd不同返回false
function checkThatNpmCanReadCwd() {
  const cwd = process.cwd();
  let childOutput = null;
    // npm config list 无结果、报错，直接返回true
    // Note: intentionally using spawn over exec since
    // the problem doesn't reproduce otherwise.
    // `npm config list` is the only reliable way I could find
    // to reproduce the wrong path. Just printing process.cwd()
    // in a Node process was not enough.
    childOutput = spawn.sync('npm', ['config', 'list']).output.join('');
  } catch (err) {
    // Something went wrong spawning node.
    // Not great, but it means we can't do this check.
    // We might fail later on, but let's continue.
    return true;
  }
  if (typeof childOutput !== 'string') {
    return true;
  }
  const lines = childOutput.split('\n'); // npm config list 输出结果多行分割为数组
  // `npm config list` output includes the following line:
  // "; cwd = C:\path\to\current\dir" (unquoted)
  // I couldn't find an easier way to get it.
  const prefix = '; cwd = ';
  const line = lines.find(line => line.startsWith(prefix));
  if (typeof line !== 'string') {
    // Fail gracefully. They could remove it.
    return true;
  }
  const npmCWD = line.substring(prefix.length);
  if (npmCWD === cwd) { // npm config的cwd 与 当前脚本的cwd相同
    return true;
  }

  // npm config list 返回的cwd 与当前脚本的cwd不相同时，报错并返回false
  console.error(
    chalk.red(
      `Could not start an npm process in the right directory.\n\n` +
        `The current directory is: ${chalk.bold(cwd)}\n` +
        `However, a newly started npm process runs in: ${chalk.bold(
          npmCWD
        )}\n\n` +
        `This is probably caused by a misconfigured system terminal shell.`
    )
  );
  if (process.platform === 'win32') {
    console.error(
      chalk.red(`On Windows, this can usually be fixed by running:\n\n`) +
        `  ${chalk.cyan(
          'reg'
        )} delete "HKCU\\Software\\Microsoft\\Command Processor" /v AutoRun /f\n` +
        `  ${chalk.cyan(
          'reg'
        )} delete "HKLM\\Software\\Microsoft\\Command Processor" /v AutoRun /f\n\n` +
        chalk.red(`Try to run the above two lines in the terminal.\n`) +
        chalk.red(
          `To learn more about this problem, read: https://blogs.msdn.microsoft.com/oldnewthing/20071121-00/?p=24433/`
        )
    );
  }
  return false;
}

// 电脑是否联网，是否在线
function checkIfOnline(useYarn) {
  if (!useYarn) {
    // Don't ping the Yarn registry.
    // We'll just assume the best case.
    return Promise.resolve(true);
  }

  return new Promise(resolve => {
    dns.lookup('registry.yarnpkg.com', err => {
      let proxy;
      if (err != null && (proxy = getProxy())) {
        // If a proxy is defined, we likely can't resolve external hostnames.
        // Try to resolve the proxy name as an indication of a connection.
        dns.lookup(url.parse(proxy).hostname, proxyErr => {
          resolve(proxyErr == null);
        });
      } else {
        resolve(err == null);
      }
    });
  });
}

function executeNodeScript({ cwd, args }, data, source) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [...args, '-e', source, '--', JSON.stringify(data)],
      { cwd, stdio: 'inherit' }
    );

    child.on('close', code => {
      if (code !== 0) {
        reject({
          command: `node ${args.join(' ')}`,
        });
        return;
      }
      resolve();
    });
  });
}

function checkForLatestVersion() {
  return new Promise((resolve, reject) => {
    https
      .get(
        'https://registry.npmjs.org/-/package/create-react-app/dist-tags',
        res => {
          if (res.statusCode === 200) {
            let body = '';
            res.on('data', data => (body += data));
            res.on('end', () => {
              resolve(JSON.parse(body).latest);
            });
          } else {
            reject();
          }
        }
      )
      .on('error', () => {
        reject();
      });
  });
}

module.exports = {
  init,
  getTemplateInstallPackage,
};
