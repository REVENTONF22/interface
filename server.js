﻿var http = require('http');
var path = require('path');
var urlParser = require('url');
var controller = require('./src');
var config = require('./config');
var fs = require('fs');
var qs = require('qs');

/* 定义控制器路由表 */
var routerList = [];

/* formData 数据转 Object */
function fdToObj (str) {
	var arr = str.match(/\w+?="\w+"\r\n\r\n[^\n]+/g) || [];
	var resObj = {};
	arr.map(function (item) {
		var temp = item.split('\r\n\r\n');
		resObj[temp[0].split('=')[1]] = temp[1];
	})
	return resObj;
}

/* 填装控制器路由表 */
controller(function (filesObj) {
	var { dataCollection, contCollection } = filesObj;

	var dataLen = dataCollection.length;
	var contLen = contCollection.length;

	for (var i = 0; i < dataLen; i++) {
		/* 是否含有控制器 */
		var isControl = false;
		var data = dataCollection[i];
		for (var j = 0; j < contLen; j++) {
			var cont = contCollection[j];
			var routLen = routerList.length;

			/* 剥离路径 */
			var strDat = data.substr(data.lastIndexOf('/'));
			var strCon = cont.substr(cont.lastIndexOf('/'));

			/* 剥离后缀 */
			var resDat = strDat.substr(0, strDat.lastIndexOf('.'));
			var resCon = strCon.substr(0, strCon.lastIndexOf('.'));

			if (resDat !== resCon) {
				var isResCon = false;
				for (var k = 0; k < routLen; k++) {
					if (routerList[k]['cont'] === cont) {
						isResCon = true;
					}
				}
				if (!isResCon) routerList.push({data: null, cont});
			}

			if (resDat === resCon) {
				isControl = true;
				/* 查到控制器 通过控制器处理之后再返回 */
				routerList.push({data, cont});
				break;
			}
		}
		if (!isControl) {
			/* 无控制器 数据直接返回 */
			routerList.push({data, cont: null});
		}
	}

	/* 填装完成创建服务器 */
	runServer();
});

/* 接收POST数据流 */
function postDataFun (req, callback) {
	/* 取POST参数 */
	var tempStream = [];

	/* 分段接收 */
	req.on('data', function (str) {
		tempStream.push(str);
	})

	/* 接收完成 */
	req.on('end', function () {
		var postData;
		var postStr = tempStream.toString();

		/* 容错 */
		try {
			if (postStr.indexOf('WebKitFormBoundary') !== -1) {
				postData = fdToObj(postStr);
			} else {
				postData = JSON.parse(postStr);
			}
		} catch (e) {
			postData = qs.parse(postStr, {ignoreQueryPrefix: true});
		}

		if (callback && typeof callback === 'function') callback(postData);
	})
}

/* 创建服务器 */
function runServer () {
	var server = http.createServer(function (req, res) {
		/* 设置请求头和跨域 */
		res.writeHead(200, {
			'Content-Type': 'application/json;charset=UTF-8',
			'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS,HEAD',
			'Access-Control-Allow-Headers': '',
			'Access-Control-Allow-Origin': '*'
		});

		/* 取URL参数 */
		var urlObj = urlParser.parse(req.url, true);

		/* 判断是否匹配到 */
		var isNoPage = false;

		/* 处理首页 */
		if (urlObj.pathname === '/') {
			isNoPage = true;
			res.write(config.indexMsg);
			res.end();
		}

		/* 匹配路由控制表 */
		routerList.map(function (item) {
			if (item.data && item.data.substr(0, item.data.lastIndexOf('.')) === urlObj.pathname) {
				isNoPage = true;
				postDataFun(req, function (postData) {
					/* 输出 */
					var jsonData;
					if (!item.cont) {
						fs.readFile(path.join(__dirname, './src/data') + item.data, function (err, data) {
							if (err) {
								res.write('错误: 数据 json 文件读取失败!');
							} else {
								var dataStr = data.toString();
								try {
									/* 对 utf-8 编码的 JSON 文件进行特殊处理 */
									if (dataStr.substr(0, 1).charCodeAt() === 65279) {
										dataStr = dataStr.substr(1, dataStr.length - 1);
									}
									/* 检查文件内容是否符合 JSON 规范 */
									var json = JSON.parse(dataStr);

									/* 继续使用 require 读取 JOSN 文件内容 */
									jsonData = require(path.join(__dirname, './src/data') + item.data);
									res.write(JSON.stringify(jsonData));
								} catch (err) {
									res.write('错误: 数据 json 内部不是一个有效的JOSN数据!');
								}
							}
							res.end();
						})
					} else {
						jsonData = require(path.join(__dirname, './src/data') + item.data);
						var resFun = require(path.join(__dirname, './src/controller') + item.cont);
						if (typeof resFun === 'function') {
							resFun(req, res, urlObj.query, postData, jsonData);
						} else {
							res.write('错误: 控制器 controller 内部不是一个函数!');
							res.end();
						}
					}
				});
			}
			if (!item.data && item.cont && item.cont.substr(0, item.cont.lastIndexOf('.')) === urlObj.pathname) {
				isNoPage = true;
				postDataFun(req, function (postData) {
					var resFun = require(path.join(__dirname, './src/controller') + item.cont);
					if (typeof resFun === 'function') {
						resFun(req, res, urlObj.query, postData, null);
					} else {
						res.write('错误: 控制器 controller 内部不是一个函数!');
						res.end();
					}
				})
			}
		})

		/* 未匹配到页面 404 */
		if (!isNoPage) {
			res.write(config.errMsg);
			res.end();
		}
	})

	/* 监听端口 */
	server.listen(config.port, function () {
		console.log(config.port + '端口监听中...');
	})
}