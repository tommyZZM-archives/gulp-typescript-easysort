/**
 * Created by tommyZZM on 2015/4/3.
 * 根据typescript之间的引用关系排序，从egret框架的编译工具中挖掘出来的。
 */
var eventStream = require('event-stream');
//var gutil = require('gulp-util');

var efile = require("./file.js");
var analysis = require("./analysis.js");

var path = require("path");

/**
 * 键是类名，值为这个类依赖的类名列表
 */
var classInfoList;
/**
 * 键是文件路径，值为这个类依赖的类文件路径,且所依赖的类都是被new出来的。
 */
var newClassInfoList;
/**
 * 键是文件路径，值为这个类实例化时需要依赖的类文件路径列表
 */
var subRelyOnInfoList;
/**
 * 键为类名，值为这个类所在的文件路径
 */
var classNameToPath;

var noneExportClassName;
/**
 * 键是不含命名空间的类名，值是命名空间
 */
var classNameToModule;
/**
 * 键为文件路径，值为这个文件包含的类名列表
 */
var pathToClassNames;
/**
 * 键为文件路径，值为这个文件依赖的类名列表(从import或全局变量中读取的)
 */
var pathInfoList;
/**
 * 键为文件路径，值为这个文件引用的文件列表
 */
var referenceInfoList;

var thmList;

var modeulClassToPath;

var exmlConfig;
/**
 * ts关键字
 */
var functionKeys = ["static", "var", "export", "public","protected", "private", "function", "get", "set", "class", "interface","module","extends","implements","super","this"];

var filesToHandle = [];
var filesToHandleDict = {};

function resetCache(){
    filesToHandle = [];
    filesToHandleDict = {};

    classInfoList = {};
    newClassInfoList = {};
    subRelyOnInfoList = {};
    classNameToPath = {};
    noneExportClassName = {};
    classNameToModule = {};
    pathInfoList = {};
    pathToClassNames = {};
    referenceInfoList = {};
    thmList = [];
    modeulClassToPath = null;
}

function SequenceTypeScriptFile(){
    resetCache();

    var onFile = function (file) {
        var filePath = path.normalize(file.path);
        //gutil.log('pushing  ' + filePath + ' into the map');
        filesToHandle.push({text:file.contents.toString(),path:filePath});
        filesToHandleDict[filePath] = file;
    };

    return eventStream.through(onFile, sequence);
}

/**
 * 创建manifest列表
 */
function sequence(){

    //gutil.log('sequencing ...');

    var i,length = filesToHandle.length;
    for (i = 0; i < length; i++) {
        var file = filesToHandle[i];
        readClassNamesFromTs(file.text,file.path);
    }

    var sortresult = sortFileList(filesToHandle);
    //gutil.log(sortresult,filesToHandle)
    for(i=0;i<sortresult.length;i++){
        //gutil.log(sortresult[i]);
        this.emit("data",filesToHandleDict[sortresult[i]])
    }

    this.emit('end');
}

/**
 * 按照引用关系排序指定的文件列表
 */
function sortFileList(list){
    var file,ext;
    var length = list.length;
    for (var i = 0; i < length; i++) {
        file = list[i];
        ext = efile.getExtension(file.path).toLowerCase();
        if(ext=="ts"){
            readRelyOnFromTs(file.text,file.path);
        }
    }
    for (i = 0; i < length; i++) {
        file = list[i];
        ext = efile.getExtension(file.path).toLowerCase();
        if(ext=="ts"){
            readReferenceFromTs(file.text,file.path);
        }
    }

    var paths = [];
    //把所有引用关系都合并到pathInfoList里，并把类名替换为对应文件路径。
    for (var path in pathInfoList) {
        paths.push(path);
        var list = pathInfoList[path];
        var classList = pathToClassNames[path];
        length = classList.length;
        for (i = 0; i < length; i++) {
            var className = classList[i];
            var relyOnList = classInfoList[className];
            if(relyOnList){
                var len = relyOnList.length;
                for (var j = 0; j < len; j++) {
                    className = relyOnList[j];
                    if (list.indexOf(className) == -1) {
                        list.push(className);
                    }
                }
            }
        }
        length = list.length;
        for (i = length - 1; i >= 0; i--) {
            className = list[i];
            var relyPath = classNameToPath[className];
            if (relyPath && relyPath != path) {
                list[i] = relyPath;
            } else {
                list.splice(i, 1);
            }
        }
    }

    var pathList = sortOnPathLevel(paths,pathInfoList,true);

    var gameList = [];
    for (var key in pathList) {
        list = pathList[key];
        list = sortOnReference(list);
        gameList = list.concat(gameList);
    }

    return gameList;
}


/**
 * 按照引用关系进行排序
 */
function sortOnReference(list){
    var pathRelyInfo = {};
    var length = list.length;
    for(var i=0;i<length;i++){
        var path = list[i];
        var refList = [];
        var reference = referenceInfoList[path];
        for(var j=list.length-1;j>=0;j--){
            var p = reference[j];
            if(list.indexOf(p)!=-1){
                refList.push(p);
            }
        }
        pathRelyInfo[path] = refList;
    }

    var pathList = sortOnPathLevel(list,pathRelyInfo,false);
    var gameList = [];
    for (var key in pathList) {
        list = pathList[key];
        list.sort();
        gameList = list.concat(gameList);
    }
    return gameList;
}
/**
 * 根据引用深度排序
 */
function sortOnPathLevel(list,pathRelyInfo,throwError){
    var length = list.length;
    var pathLevelInfo = {};
    for(var i=0;i<length;i++){
        var path = list[i];
        setPathLevel(path, 0, pathLevelInfo, [path],pathRelyInfo,throwError);
    }

    //pathList里存储每个level对应的文件路径列表
    var pathList = [];
    for (path in pathLevelInfo) {
        var level = pathLevelInfo[path];
        if (pathList[level]) {
            pathList[level].push(path);
        }
        else {
            pathList[level] = [path];
        }
    }
    return pathList;
}
/**
 * 设置文件引用深度
 */
function setPathLevel(path, level, pathLevelInfo, map,pathRelyInfo,throwError,checkNew) {
    if (pathLevelInfo[path] == null) {
        pathLevelInfo[path] = level;
    } else {
        if(pathLevelInfo[path]<level){
            pathLevelInfo[path] = level;
        }
        else{
            return;
        }
    }
    var list = pathRelyInfo[path];
    if(checkNew){
        var list = list.concat();
        var subList = subRelyOnInfoList[path];
        if(subList){
            for(i = subList.length-1;i>=0;i--){
                relyPath = subList[i];
                if(list.indexOf(relyPath)==-1){
                    list.push(relyPath);
                }
            }
        }
    }
    if(throwError){
        var newList = newClassInfoList[path];
    }

    var length = list.length;
    for (var i = 0; i < length; i++) {
        var relyPath = list[i];
        if (map.indexOf(relyPath) != -1) {
            if(throwError){
                map.push(relyPath);
                console.log("1103: error 类文件之间存在循环依赖，请检查类的继承关系或静态变量的初始化引用。",path);
                //globals.exit(1103, "There is a circular dependency amongthe {0}: error files, please check the class inheritance or static variable initialization references.");
                process.exit(1103);
            }
            break;
        }
        var checkNewFlag = checkNew||(newList&&newList.indexOf(relyPath)!=-1);
        setPathLevel(relyPath, level + 1, pathLevelInfo, map.concat(relyPath),pathRelyInfo,throwError,checkNewFlag);
    }
}

/**
 * 读取一个TS文件引用的类名列表
 */
function readReferenceFromTs(text,path){
    //var text = efile.read(path);
    var orgText = analysis.removeCommentExceptQuote(text);
    text = analysis.removeComment(text,path);
    var block = "";
    var tsText = "";
    var moduleList = {};
    while (text.length > 0) {
        var index = text.indexOf("{");
        if (index == -1) {
            if (tsText) {
                tsText = "";
            }
            break;
        } else {
            var preStr = text.substring(0, index);
            tsText += preStr;
            text = text.substring(index);
            index = analysis.getBracketEndIndex(text);
            if (index == -1) {
                break;
            }
            block = text.substring(1, index);
            text = text.substring(index + 1);
            var ns = analysis.getLastWord(preStr);

            preStr = analysis.removeLastWord(preStr,ns);
            var word = analysis.getLastWord(preStr);

            if (word == "module") {
                if (tsText) {
                    tsText = "";
                }
                if(!moduleList[ns]){
                    moduleList[ns] = block;
                }
                else{
                    moduleList[ns] += block;
                }

            } else {
                tsText += "{" + block + "}";
            }
        }
    }

    var list = [];
    checkAllClassName(classNameToPath,path,list,moduleList,orgText);
    var length = list.length;
    for(var i=0;i<length;i++){
        list[i] = classNameToPath[list[i]];
    }
    if(modeulClassToPath){
        var newList = []
        checkAllClassName(modeulClassToPath,path,newList,moduleList,orgText);
        length = newList.length;
        for(i=0;i<length;i++){
            var value = modeulClassToPath[newList[i]];
            if(list.indexOf(value)==-1){
                list.push(value);
            }
        }
    }

    referenceInfoList[path] = list;
}

function checkAllClassName(classNameToPath,path,list,moduleList,orgText){
    var exclude = pathToClassNames[path];
    findClassInLine(orgText,exclude,"",list,classNameToPath)
    for(var ns in moduleList){
        var text = moduleList[ns];
        findClassInLine(text,exclude,ns,list,classNameToPath);
    }
}

/**
 * 读取一个ts文件引用的类列表
 */
function readClassNamesFromTs(text,path) {
    //var text = efile.read(path);
    text = analysis.removeComment(text,path);
    var list = [];
    var noneExportList = [];
    analyzeModule(text,list,noneExportList,"");
    if(noneExportList.length>0){
        noneExportClassName[path] = noneExportList;
    }
    //console.log("readClassNamesFromTs",list,path,text)
    var length = list.length;
    for (var i = 0; i < length; i++) {
        var className = list[i]
        if(classNameToPath[className]){
            checkRepeatClass(path,classNameToPath[className],className);
        }
        classNameToPath[className] = path;
    }
    pathToClassNames[path] = list;
}

function checkRepeatClass(newPath,oldPath,className){
    if(newPath==oldPath||!newPath||!oldPath){
        return;
    }
    var index = newPath.lastIndexOf(".");
    var p1 = newPath.substring(0,index);
    index = oldPath.lastIndexOf(".");
    var p2 = oldPath.substring(0,index);
    if(p1==p2){
        return;
    }
    var list = noneExportClassName[newPath];
    if(list&&list.indexOf(className)!=-1){
        return;
    }
    list = noneExportClassName[oldPath];
    if(list&&list.indexOf(className)!=-1){
        return;
    }
    console.log(1308,"repeat class",className,newPath,oldPath);
}

/**
 * 分析一个ts文件
 */
function analyzeModule(text,list,noneExportList,moduleName)
{
    var block = "";
    //console.log("analyzeModule",text);
    while (text.length > 0){
        var index = analysis.getFirstVariableIndex("module",text);
        if (index == -1){
            readClassFromBlock(text,list,noneExportList,moduleName);
            break;
        }
        else{
            var preStr = text.substring(0, index).trim();
            if(preStr){
                readClassFromBlock(preStr,list,noneExportList,moduleName);
            }
            text = text.substring(index+6);
            var ns = analysis.getFirstWord(text);
            ns = analysis.trimVariable(ns);
            index = analysis.getBracketEndIndex(text);
            if (index == -1){
                break;
            }
            block = text.substring(0, index);
            text = text.substring(index + 1);
            index = block.indexOf("{");
            block = block.substring(index+1);
            if(moduleName){
                ns = moduleName+"."+ns;
            }
            analyzeModule(block,list,noneExportList,ns);
        }
    }
}

/**
 * 从代码块中读取类名，接口名，全局函数和全局变量，代码块为一个Module，或类外的一段全局函数定义
 */
function readClassFromBlock(text,list,noneExportList,ns){
    var newText = "";
    while(text.length>0){
        var index = text.indexOf("{");
        if(index==-1){
            newText += text;
            break;
        }
        newText += text.substring(0,index);
        text = text.substring(index);
        index = analysis.getBracketEndIndex(text);
        if(index==-1){
            newText += text;
            break;
        }
        text = text.substring(index+1);
    }
    text = newText;
    while (text.length > 0){
        var noneExported = false;
        var classIndex = analysis.getFirstVariableIndex("class", text);
        if(classIndex==-1){
            classIndex = Number.POSITIVE_INFINITY;
        }
        else if(ns){
            if(analysis.getLastWord(text.substring(0,classIndex))!="export")
            {
                noneExported = true;
            }
        }
        var interfaceIndex = analysis.getFirstVariableIndex("interface", text);
        if(interfaceIndex==-1){
            interfaceIndex = Number.POSITIVE_INFINITY;
        }
        else if(ns){
            if(analysis.getLastWord(text.substring(0,interfaceIndex))!="export")
            {
                noneExported = true;
            }
        }
        var enumIndex = getFirstKeyWordIndex("enum",text,ns);
        var functionIndex = getFirstKeyWordIndex("function", text,ns);
        var varIndex = getFirstKeyWordIndex("var", text,ns);
        classIndex = Math.min(interfaceIndex,classIndex,enumIndex,functionIndex,varIndex);
        if (classIndex == Number.POSITIVE_INFINITY){
            break;
        }

        var isVar = (classIndex==varIndex);
        var keyLength = 5;
        switch (classIndex){
            case varIndex:
                keyLength = 3;
                break;
            case interfaceIndex:
                keyLength = 9;
                break;
            case functionIndex:
                keyLength = 8;
                break;
            case enumIndex:
                keyLength = 4;
                break;
        }

        text = text.substring(classIndex + keyLength);
        var word = analysis.getFirstVariable(text);
        if (word) {
            var className;
            if (ns){
                className = ns + "." + word;
            }
            else{
                className = word;
            }
            if (list.indexOf(className) == -1){
                list.push(className);
                if(noneExported){
                    noneExportList.push(className);
                }
                if(ns){
                    var nsList = classNameToModule[word];
                    if(!nsList){
                        nsList = classNameToModule[word] = [];
                    }
                    if(nsList.indexOf(ns)==-1){
                        nsList.push(ns);
                    }
                }
            }
            text = analysis.removeFirstVariable(text);
        }
        if(isVar){
            classIndex = text.indexOf("\n");
            if(classIndex==-1){
                classIndex = text.length;
            }
            text = text.substring(classIndex);
        }
        else{
            classIndex = analysis.getBracketEndIndex(text);
            text = text.substring(classIndex + 1);
        }
    }
}
/**
 * 读取第一个关键字的索引
 */
function getFirstKeyWordIndex(key,text,ns){
    var index = analysis.getFirstVariableIndex(key, text);
    if(index==-1){
        index = Number.POSITIVE_INFINITY;
    }
    else if(ns){
        if(analysis.getLastWord(text.substring(0,index))!="export")
        {
            index = Number.POSITIVE_INFINITY;
        }
    }
    return index;
}

/**
 * 读取一个ts文件引用的类列表
 */
function readRelyOnFromTs(text,path) {
    var fileRelyOnList = [];
    //var text = efile.read(path);
    text = analysis.removeComment(text,path);
    readRelyOnFromImport(text, fileRelyOnList);
    analyzeModuleForRelyOn(text,path,fileRelyOnList,"");
    pathInfoList[path] = fileRelyOnList;
}

/**
 * 从import关键字中分析引用关系
 */
function readRelyOnFromImport(text, fileRelyOnList) {
    while (text.length > 0) {
        var index = analysis.getFirstVariableIndex("import", text);
        if (index == -1) {
            break;
        }
        text = text.substring(index + 6);
        text = analysis.removeFirstVariable(text).trim();
        if (text.charAt(0) != "=") {
            continue;
        }
        text = text.substring(1);
        var className = analysis.getFirstWord(text);
        className = analysis.trimVariable(className);
        if (fileRelyOnList.indexOf(className) == -1) {
            fileRelyOnList.push(className);
        }
    }
}

/**
 * 分析一个ts文件
 */
function analyzeModuleForRelyOn(text,path,fileRelyOnList,moduleName){
    while (text.length > 0){
        var index = analysis.getFirstVariableIndex("module",text);
        if (index == -1){
            readRelyOnFromBlock(text,path,fileRelyOnList,moduleName);
            break;
        }
        else{
            var preStr = text.substring(0, index).trim();
            if(preStr){
                readRelyOnFromBlock(preStr,path,fileRelyOnList,moduleName);
            }

            text = text.substring(index+6);
            var ns = analysis.getFirstWord(text);
            ns = analysis.trimVariable(ns);
            index = analysis.getBracketEndIndex(text);
            if (index == -1){
                break;
            }
            var block = text.substring(0, index+1);
            text = text.substring(index + 1);
            if(moduleName){
                ns = moduleName+"."+ns;
            }
            analyzeModuleForRelyOn(block,path,fileRelyOnList,ns);
        }
    }
}

/**
 * 从代码块中分析引用关系，代码块为一个Module，或类外的一段全局函数定义
 */
function readRelyOnFromBlock(text, path,fileRelyOnList,ns) {

    while (text.length > 0) {
        var index = analysis.getFirstVariableIndex("class", text);
        if(index==-1){
            escapFunctionLines(text,pathToClassNames[path],ns,fileRelyOnList);
            break;
        }

        var keyLength = 5;
        var preStr = text.substring(0, index + keyLength);
        escapFunctionLines(preStr,pathToClassNames[path],ns,fileRelyOnList)

        text = text.substring(index + keyLength);
        var word = analysis.getFirstVariable(text);
        if (word) {
            var className;
            if (ns) {
                className = ns + "." + word;
            } else {
                className = word;
            }
            var relyOnList = classInfoList[className];
            if (!relyOnList) {
                relyOnList = classInfoList[className] = [];
            }
            text = analysis.removeFirstVariable(text);
            word = analysis.getFirstVariable(text);
            if (word == "extends") {
                text = analysis.removeFirstVariable(text);
                word = analysis.getFirstWord(text);
                word = analysis.trimVariable(word);
                word = getFullClassName(word,ns);
                if (relyOnList.indexOf(word) == -1) {
                    relyOnList.push(word);
                }
            }
        }
        index = analysis.getBracketEndIndex(text);
        var classBlock = text.substring(0, index + 1);
        text = text.substring(index + 1);
        index = classBlock.indexOf("{");
        classBlock = classBlock.substring(index);
        getSubRelyOnFromClass(classBlock,ns,className);
        getRelyOnFromStatic(classBlock, ns,className, relyOnList);
    }
}

/**
 * 根据类类短名，和这个类被引用的时所在的module名来获取完整类名。
 */
function getFullClassName(word,ns) {
    if (!ns||!word) {
        return word;
    }
    var prefix = "";
    var index = word.lastIndexOf(".");
    var nsList;
    if(index==-1){
        nsList = classNameToModule[word];
    }
    else{
        prefix = word.substring(0,index);
        nsList = classNameToModule[word.substring(index+1)];
    }
    if(!nsList){
        return word;
    }
    var length = nsList.length;
    var targetNs = "";
    for(var k=0;k<length;k++){
        var superNs = nsList[k];
        if(prefix){
            var tail = superNs.substring(superNs.length-prefix.length);
            if(tail==prefix){
                superNs = superNs.substring(0,superNs.length-prefix.length-1);
            }
            else{
                continue;
            }
        }
        if(ns.indexOf(superNs)==0){
            if(superNs.length>targetNs.length){
                targetNs = superNs;
            }
        }
    }
    if(targetNs){
        word = targetNs+"."+word;
    }
    return word;
}


/**
 * 从类代码总读取构造函数和成员变量实例化的初始值。
 */
function getSubRelyOnFromClass(text,ns, className) {
    if(!text){
        return;
    }
    text = text.substring(1,text.length-1);
    var list = [];
    var functMap = {};
    while (text.length > 0) {
        var index = analysis.getBracketEndIndex(text);
        if (index == -1) {
            index = text.length;
        }
        var codeText = text.substring(0,index+1);
        text = text.substring(index+1);
        index = codeText.indexOf("{");

        if(index==-1){
            index = codeText.length;
        }
        var funcText = codeText.substring(index);
        codeText = codeText.substring(0,index);
        index = analysis.getBracketStartIndex(codeText,"(",")");
        if(funcText&&index!=-1){
            codeText = codeText.substring(0,index);
            var word = analysis.getLastWord(codeText);
            if(word=="constructor"){
                word = "__constructor";
            }
            functMap[word] = funcText;
        }
        findClassInLine(codeText,[className],ns,list,classNameToPath);
    }
    readSubRelyOnFromFunctionCode("__constructor",functMap,ns,className,list);
    for(var i=list.length- 1;i>=0;i--){
        var name = list[i];
        var path = classNameToPath[name];
        if(path){
            list[i] = path;
        }
        else{
            list.splice(i,1);
        }
    }
    path = classNameToPath[className];
    subRelyOnInfoList[path] = list;
}
/**
 * 从构造函数开始递归查询初始化时被引用过的类。
 */
function readSubRelyOnFromFunctionCode(funcName,functMap,ns,className,list){
    var text = functMap[funcName];
    if(!text)
        return;
    delete functMap[funcName];
    findClassInLine(text,[className],ns,list,classNameToPath);
    for (funcName in functMap){
        if(text.indexOf(funcName+"(")!=-1&&analysis.containsVariable(funcName,text)){
            readSubRelyOnFromFunctionCode(funcName,functMap,ns,className,list);
        }
    }
}


/**
 * 从代码的静态变量中读取依赖关系
 */
function getRelyOnFromStatic(text,ns, className, relyOnList) {

    var newList = [];
    while (text.length > 0) {
        var index = analysis.getFirstVariableIndex("static", text);
        if (index == -1) {
            break;
        }
        text = text.substring(index);
        text = trimKeyWords(text);
        text = analysis.removeFirstVariable(text).trim();
        if (text.charAt(0) == "(") {
            continue;
        }
        if (text.charAt(0) == ":") {
            text = text.substring(1);
            while (text.length > 0) {
                text = analysis.removeFirstVariable(text).trim();
                if (text.charAt(0) != ".") {
                    break;
                }
                text = text.substring(1).trim();
            }
        }
        if (text.charAt(0) != "=") {
            continue;
        }
        text = text.substring(1).trim();

        index = text.indexOf("\n");
        var line = text;
        if(index!=-1){
            line = text.substring(0,index);
            text = text.substring(index);
        }
        if(line.indexOf("new")==0){
            var code = analysis.removeFirstVariable(line).trim();
            index = code.indexOf("(");
            if(index!=-1){
                code = code.substring(0,index);
            }
            code = analysis.trimVariable(code);
            code = getFullClassName(code,ns);
            var path = classNameToPath[code];
            if(path&&code!=className&&newList.indexOf(path)==-1){
                newList.push(path);
            }
        }
        escapFunctionLines(line,[className],ns,relyOnList);
    }
    path = classNameToPath[className];
    newClassInfoList[path] = newList;
}

/**
 * 排除代码段里的全局函数块。
 */
function escapFunctionLines(text,classNames,ns,relyOnList){
    while(text.length>0){
        var index = analysis.getFirstVariableIndex("function",text);
        if(index==-1){
            findClassInLine(text,classNames,ns,relyOnList,classNameToPath);
            break;
        }
        findClassInLine(text.substring(0,index),classNames,ns,relyOnList,classNameToPath);
        text = text.substring(index);
        index = analysis.getBracketEndIndex(text);
        if(index==-1){
            break;
        }
        text = text.substring(index);
    }
}


function findClassInLine(text,classNames,ns,relyOnList,classNameToPath){
    var word = "";
    var length = text.length;
    for (var i = 0; i < length; i++) {
        var char = text.charAt(i);
        if (char <= "Z" && char >= "A" || char <= "z" && char >= "a" || char <= "9" && char >= "0" || char == "_" || char == "$"||char==".") {
            word += char;
        } else if(word){
            if(functionKeys.indexOf(word)==-1&&classNames.indexOf(word)==-1){
                var found = false;
                var names;
                if(word.indexOf(".")!=-1) {
                    names = word.split(".");
                }
                else{
                    names = [word];
                }
                var len = names.length;
                for(var j=0;j<len;j++){
                    if(j==0)
                        word = names[0];
                    else
                        word += "."+names[j];
                    var path = classNameToPath[word];
                    if(path&&typeof(path)=="string"&&classNames.indexOf(word)==-1){
                        found = true;
                        break;
                    }
                    if(ns){
                        word = ns+"."+word;
                        path = classNameToPath[word];
                        if(path&&typeof(path)=="string"&&classNames.indexOf(word)==-1){
                            found = true;
                            break;
                        }
                    }
                }
                if(found){
                    if (relyOnList.indexOf(word) == -1) {
                        relyOnList.push(word);
                    }
                }
            }
            word = "";
        }
    }
}

/**
 * 删除字符串开头的所有关键字
 */
function trimKeyWords(codeText) {
    codeText = codeText.trim();
    var word;
    while (codeText.length > 0) {
        word = analysis.getFirstVariable(codeText);
        if (functionKeys.indexOf(word) == -1) {
            break;
        }
        codeText = analysis.removeFirstVariable(codeText, word);
    }
    return codeText;
}

module.exports = SequenceTypeScriptFile;