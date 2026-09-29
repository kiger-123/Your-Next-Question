import {Config} from '@remotion/cli/config';
Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
Config.setConcurrency('50%');
Config.setChromeMode('chrome-headless-shell');
Config.setBrowserExecutable('C:/Program Files/Google/Chrome/Application/chrome.exe');
