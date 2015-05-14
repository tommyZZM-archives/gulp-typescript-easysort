# gulp-typescript-easysort
Squerence TypeScript Files Accroding to Their Reference from each other


# useage
```javascript
gulp.task('src-sort', function() {
    return gulp.src("./src/**/*.ts")
        .pipe(tssort())
        .pipe(filelist('alcedo-src-filelist.json'))
        .pipe(gulp.dest("./tmp/"));
});