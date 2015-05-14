# gulp-typescript-easysort
Squerence TypeScript Files Accroding to Their Reference from each other,
witch means you can sort a group of typescript files with out
```typescript
///<reference path="..."/>
```

通过TypeScript文件间相互引用关系，对一系列.ts文件进行排序，而不需要
```typescript
///<reference path="..."/>
```

# Useage Example
```javascript
var tssort = require('gulp-typescript-easysort');

gulp.task('src-sort', function() {
    return gulp.src("./src/**/*.ts")
        .pipe(tssort())
        .pipe(filelist('alcedo-src-filelist.json'))
        .pipe(gulp.dest("./tmp/"));
});
```

returns a new Array of this files.