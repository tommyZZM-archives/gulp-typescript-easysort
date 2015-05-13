/**
 * Created by tommyZZM on 2015/3/10.
 */
var path = require("path");
var fs = require("fs");

/**
 * 检查文件是否存在.
 */
function checkfile(dir,filename,hard){
    dir = path.join(dir, "");
    var f = filename?path.join(dir, filename):dir;
    if (!fs.existsSync(f)) {
        //if(filename)console.log(filename,'not exist in',dir);
        if(hard){
            process.exit([1]);
        }
        return false;
    }
    return f;
}

/**
 * 遍历目录..
 */
function walk(dir, done, param) {
    var results = [];
    //console.log("walk",dir);
    fs.readdir(dir, function(err, list) {
        if (err) return done.call(this,null,param);
        var pending = list.length;
        //console.log(list,list.length);
        if (!pending) return done.call(this,results,param);
        list.forEach(function(file) {
            var filepath = path.join(dir, file);
            //console.log(filepath);
            file = path.resolve(dir, file);
            fs.stat(file, function(err, stat) {
                if (stat && stat.isDirectory()) {
                    //console.log(stat.isDirectory(),file)
                    walk(file, function(res,param) {
                        //console.log(res);
                        results = results.concat(res);
                        if (!--pending) done.call(this,results,param);
                    },param);
                } else {
                    //console.log("push",file,!--pending);
                    if(file)results.push(file);
                    if (!--pending) done.call(this,results,param);
                }
            });

        });
    });
}

/**
 * 指定路径的文件或文件夹是否存在
 */
function exists(_path) {
    _path = escapePath(_path);
    return fs.existsSync(_path);
}

/**
 * 保存数据到指定文件
 * @param path 文件完整路径名
 * @param data 要保存的数据
 */
function save(_path,data){
    if(exists(_path)) {
        remove(_path);
    }
    _path = escapePath(_path);
    createDirectory(path.dirname(_path));
    fs.writeFileSync(_path,data,"utf-8");
}

/**
 * 读取文本文件,返回打开文本的字符串内容，若失败，返回"".
 * @param path 要打开的文件路径
 */
var textTemp = {};
function read(path) {
    path = escapePath(path);
    var text = textTemp[path];
    if(text){
        return text;
    }
    try{
        text = fs.readFileSync(path,"utf-8");
        text = text.replace(/^\uFEFF/, '');
    }
    catch (err0) {
        return "";
    }
    if(text){
        var ext = getExtension(path).toLowerCase();
        if(ext=="ts"){
            textTemp[path] = text;
        }
    }
    return text;
}

/**
 * 复制文件或目录
 * @param source 文件源路径
 * @param dest 文件要复制到的目标路径
 */
function copy(source, dest) {
    source = escapePath(source);
    dest = escapePath(dest);
    var stat = fs.lstatSync(source);
    if (stat.isDirectory()) {
        _copy_dir(source, dest);
    }
    else {
        _copy_file(source, dest);
    }
}

function _copy_file(source_file, output_file) {
    createDirectory(path.dirname(output_file))
    var byteArray = fs.readFileSync(source_file);
    fs.writeFileSync(output_file, byteArray);
}

function _copy_dir(sourceDir, outputDir) {
    createDirectory(outputDir);
    var list = fs.readdirSync(sourceDir);
    list.forEach(function (fileName) {
        copy(path.join(sourceDir, fileName), path.join(outputDir, fileName));
    });
}

/**
 * 删除文件或目录
 * @param path 要删除的文件源路径
 */
function remove(_path) {
    if(exists(_path)){
        _path = escapePath(_path);
        try{
            fs.lstatSync(_path).isDirectory()
                ? rmdir(_path)
                : fs.unlinkSync(_path)
        }
        catch (e){
            console.log(e)
        }
    }
}

function rmdir(path) {
    var files = [];
    if( fs.existsSync(path) ) {
        files = fs.readdirSync(path);
        files.forEach(function(file){
            var curPath = path + "/" + file;
            if(fs.statSync(curPath).isDirectory()) {
                rmdir(curPath);
            }
            else {
                fs.unlinkSync(curPath);
            }
        });
        fs.rmdirSync(path);
    }
}


/**
 * 获取路径的文件名(不含扩展名)或文件夹名
 */
function getFileName(path) {
    if (!path)
        return "";
    path = escapePath(path);
    var startIndex = path.lastIndexOf("/");
    var endIndex;
    if (startIndex > 0 && startIndex == path.length - 1) {
        path = path.substring(0, path.length - 1);
        startIndex = path.lastIndexOf("/");
        endIndex = path.length;
        return path.substring(startIndex + 1, endIndex);
    }
    endIndex = path.lastIndexOf(".");
    if (endIndex == -1)
        endIndex = path.length;
    return path.substring(startIndex + 1, endIndex);
}

/**
 * 获得路径的扩展名,不包含点字符。
 */
function getExtension(path) {
    path = escapePath(path);
    var index = path.lastIndexOf(".");
    if(index==-1)
        return "";
    var i = path.lastIndexOf("/");
    if(i>index)
        return "";
    return path.substring(index+1);
}


/**
 * 使用指定扩展名搜索文件夹及其子文件夹下所有的文件
 * @param dir 要搜索的文件夹
 * @param extension 要搜索的文件扩展名,不包含点字符，例如："png"。不设置表示获取所有类型文件。
 */
function search(dir, extension) {
    var list = [];
    try{
        var stat = fs.statSync(dir);
    }
    catch(e){
        return list;
    }
    if (stat.isDirectory()) {
        findFiles(dir,list,extension,null);
    }
    return list;
}

function findFiles(filePath,list,extension,filterFunc,checkDir) {
    var files = fs.readdirSync(filePath);
    var length = files.length;
    for (var i = 0; i < length; i++) {
        if (files[i].charAt(0) == ".") {
            continue;
        }
        var p = path.join(filePath ,files[i]);
        var stat = fs.statSync(p);
        if (stat.isDirectory()) {
            if(checkDir){
                if (!filterFunc(p)) {
                    continue;
                }
            }
            findFiles(p, list,extension,filterFunc);
        }
        else if (filterFunc != null) {
            if (filterFunc(p)) {
                list.push(p);
            }
        }
        else if(extension){
            var len = extension.length;
            if(p.charAt(p.length-len-1)=="."&&
                p.substr(p.length-len,len).toLowerCase()==extension){
                list.push(p);
            }
        }
        else{
            list.push(p);
        }
    }
}

/**
 * 转换本机路径为Unix风格路径。
 */
function escapePath(_path) {
    if (!_path || typeof _path!="string")
        return "";
    return _path.split("\\").join("/");
}

/**
 * 创建文件夹
 */
function createDirectory(_path, mode, made) {
    _path = escapePath(_path);
    if (mode === undefined) {
        mode = 777 & (~process.umask());
    }
    if (!made) made = null;

    if (typeof mode === 'string')
        mode = parseInt(mode, 8);
    _path = path.resolve(_path);

    try {
        fs.mkdirSync(_path, mode);
        made = made || _path;
    }
    catch (err0) {
        switch (err0.code) {
            case 'ENOENT' :
                made = createDirectory(path.dirname(_path), mode, made);
                createDirectory(_path, mode, made);
                break;

            default:
                var stat;
                try {
                    stat = fs.statSync(_path);
                }
                catch (err1) {
                    throw err0;
                }
                if (!stat.isDirectory()) throw err0;
                break;
        }
    }
    return made;
}


/**
 * 使用过滤函数搜索文件夹及其子文件夹下所有的文件
 * @param dir 要搜索的文件夹
 * @param filterFunc 过滤函数：filterFunc(file:File):Boolean,参数为遍历过程中的每一个文件，返回true则加入结果列表
 */
function searchByFunction(dir, filterFunc) {
    var list = [];
    var checkDir = arguments[2];
    try{
        var stat = fs.statSync(dir);
    }
    catch(e){
        return list;
    }
    if (stat.isDirectory()) {
        findFiles(dir,list,"",filterFunc,checkDir);
    }
    return list;
}

/**
 * 连接路径,支持传入多于两个的参数。也支持"../"相对路径解析。返回的分隔符为Unix风格。
 */
function joinPath(dir,filename){
    var _path = path.join.apply(null,arguments);
    _path = escapePath(_path);
    return _path;
}


/**
 * 判断路径类型
 */
function isDirectory(_path){
    _path = escapePath(_path);
    try{
        var stat = fs.statSync(_path);
    }
    catch(e){
        return false;
    }
    return stat.isDirectory();
}

function isSymbolicLink(_path){
    _path = escapePath(_path);
    try{
        var stat = fs.statSync(_path);
    }
    catch(e){
        return false;
    }
    return stat.isSymbolicLink();
}

function isFile(_path){
    _path = escapePath(_path);
    try{
        var stat = fs.statSync(_path);
    }
    catch(e){
        return false;
    }
    return stat.isFile();
}

exports.checkfile = checkfile;
exports.walk = walk;
exports.save = save;
exports.read = read;
exports.copy = copy;
exports.remove = remove;
exports.exists = exists;
exports.getFileName = getFileName;
exports.getExtension = getExtension;
exports.search = search;

exports.searchByFunction = searchByFunction;
exports.createDirectory = createDirectory;
exports.joinPath = joinPath;

exports.isDirectory = isDirectory;
exports.isSymbolicLink = isSymbolicLink;
exports.isFile = isFile;