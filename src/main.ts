import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';

// SockJS expects a Node-style global in some bundles.
(window as typeof window & { global?: Window }).global = window;

bootstrapApplication(AppComponent, appConfig).catch(err => console.error(err));
