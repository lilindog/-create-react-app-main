## npx CREATE-REACT-APP  从tasks/cra.js启动
packages下的每个包的依赖（开发依赖、可选依赖）只要包含本目录下的都设置为相对路径
然后切换到packages/react-scripts目录下执行npm pack打包，生成打包文件，
启动 create-react-app/index.js 把刚才打包好的文件名路径以 --scripts-version的参数传递过去

## create-rect-app/index.js
index.js检查node版本，然后启动createReactApp.js中的init方法。

createReactApp.js: 
init方法，部署命令行，检查create-react-app的版本，执行createApp()
* node小于14，则把传入的version改为version = 'react-scripts@0.9.x';
* 检测项目目录名的合法性