## 1.cra.js
```js
/***
 * 步骤
 *
 *
 * 1. 检查项目，不是新的git目录， 则报错退出进程
 * 2. 遍历packages下的每个包， 把包之间的依赖（package.json中的）改写为file: 协议的相对地址
 * 3. 使用npm pack 打包packages下的 react-scripts 为压缩文件 备用
 * 4. 运行create-react-app包的index.js 传入命令参数 --scripts-version = 刚打包的react-scripts压缩文件
 *
 *
 */
```

## 2.create-react-app/index.js
```js
/***
 * 步骤
 *
 *
 * 1. 检查node版本，小于14报错退出进程
 * 2. 执行 ./createReactApp.js 的 init 方法
 *
 *
 */
```

## 3.create-react-app/createReactApp.js
```js
/**
 * 步骤
 *
 * 1. 接收用户命令行参数
 * 2. 对比create-react-app当前版本与线上版本，若小于线上版本，则终止执行。
 * 3. 创建项目目录，写入package.json。
 * 4. 安装react, react-dom, react-scripts, cra-template到项目。
 *    执行安装好的 react-scripts/scripts/init.js 的默认导出函数，传参： [root, appName, verbose, originalDirectory, templateName]
 */
```

## 4. react-scripts/scripts/init.js
```js
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
 * 12. 一大堆log提示，然后进程结束。 如： 提示用户执行npm start 进入开发模式，执行npm run build 进入打包模式 等等...。
 *
 *
 */
```
ts初始化： 
```js
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
```


---

告一段落，接下来就是用户执行npm start来启动开发项目的逻辑了。

## 11. react-scripts/scripts/start.js
```js


```