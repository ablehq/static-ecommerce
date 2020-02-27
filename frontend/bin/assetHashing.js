const fs = require('fs');
const path = require('path');
const md5 = require('md5');
const assetsFolder = path.join(__dirname, '..', 'dist', 'assets');
const htmlFolder = path.join(__dirname, '..', 'dist');
const cheerio = require('cheerio');

const filesMap = new Map();

const getAllFiles = function(directory, fileExtensions, arrayOfFiles) {
  let files = fs.readdirSync(directory);
  arrayOfFiles = arrayOfFiles || [];

  files.forEach(file => {
    let filePath = path.join(directory, file);
    if (fs.statSync(filePath).isDirectory()) {
      arrayOfFiles = getAllFiles(filePath, fileExtensions, arrayOfFiles);
    } else {
      let extension = path.extname(file).substr(1);
      if (fileExtensions.includes(extension)) {
        arrayOfFiles.push({ directory, file });
      }
    }
  });

  return arrayOfFiles;
};

const generateHash = file => {
  const filePath = path.join(file.directory, file.file);
  const fileContent = fs.readFileSync(filePath);
  return md5(fileContent.toString());
};

const hashedFileName = file => {
  let fileName = file['file'];
  let splitFileName = fileName.split('.');
  let length = splitFileName.length;
  let hash = generateHash(file);
  splitFileName.splice(length - 1, 0, hash);

  return splitFileName.join('.');
};

const relativePath = file => {
  let dirPath = file.directory;
  let assetsPosition = dirPath.search('/assets');
  let length = dirPath.length;

  return dirPath.slice(assetsPosition, length);
};

const addFileHash = file => {
  file.hashedFileName = hashedFileName(file);
  file.relativePath = `${relativePath(file)}/${file.file}`;
  file.hashedRelativePath = `${relativePath(file)}/${file.hashedFileName}`;

  filesMap.set(file.relativePath, file.hashedRelativePath);

  fs.rename(
    path.join(file.directory, file.file),
    path.join(file.directory, file.hashedFileName),

    function(err) {
      if (err) {
        console.log(`Error: ${err}`);
      }
    }
  );

  return true;
};

const updateReferencesinHtml = (file, assetFilesArray) => {
  const filePath = path.join(file.directory, file.file);
  const $ = cheerio.load(fs.readFileSync(filePath, 'utf-8'));

  $('link[href]').each(function() {
    let cssPath = $(this).attr('href');
    let hashedPath = filesMap.get(cssPath);

    if (hashedPath) {
      $(this).attr('href', hashedPath);
    }
  });

  $('script[src]').each(function() {
    let jsPath = $(this).attr('src');
    let hashedPath = filesMap.get(jsPath);

    if (hashedPath) {
      $(this).attr('src', hashedPath);
    }
  });

  $('img[src]').each(function() {
    let imagePath = $(this).attr('src');
    let hashedPath = filesMap.get(imagePath);

    if (hashedPath) {
      $(this).attr('src', hashedPath);
    }
  });

  fs.writeFile(filePath, $.html(), err => {
    if (err) {
      console.log(`Error writing file: ${err}`);
    }
  });
};

const updateReferencesInCss = (file, assetFilesArray) => {
  const filePath = path.join(file.directory, file.file);
  let css = fs.readFileSync(filePath, 'utf-8');
  regex = /(url\s*\()(\s*)([^\s'")].*?)(\s*\))/gi;

  const urls = css.match(regex);

  if (urls) {
    urls.forEach(url => {
      let imagePath = url.slice(4, -1);
      let hashedPath = filesMap.get(imagePath);

      if (hashedPath) {
        css = css.replace(imagePath, hashedPath);
      }
    });

    fs.writeFile(filePath, css, err => {
      if (err) {
        console.log(`Error writing file: ${err}`);
      }
    });
  }

  return true;
};

assetFilesArray = getAllFiles(assetsFolder, [
  'js',
  'css',
  'svg',
  'png',
  'jpg',
  'woff'
]);

assetFilesArray.forEach(function(file) {
  addFileHash(file);
});

console.log(assetFilesArray);

htmlFilesArray = getAllFiles(htmlFolder, ['html']);
htmlFilesArray.forEach(function(file) {
  updateReferencesinHtml(file, assetFilesArray);
});

console.log(htmlFilesArray);

cssFilesArray = getAllFiles(htmlFolder, ['css']);

console.log(cssFilesArray);
cssFilesArray.forEach(function(file) {
  updateReferencesInCss(file, assetFilesArray);
});
