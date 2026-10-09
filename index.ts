import { registerRootComponent } from 'expo';

// Background location task must be registered before the app renders.
import './src/services/memories/tracking';
import App from './src/App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
