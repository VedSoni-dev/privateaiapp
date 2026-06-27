/**
 * @format
 */
import 'react-native-gesture-handler';
import {AppRegistry} from 'react-native';
import App from './src/App';

const appName = require('./app.config.js').name;

AppRegistry.registerComponent(appName, () => App);
