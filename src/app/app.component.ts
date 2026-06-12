import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TfOfflineService } from './core/services/tf-offline.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: '<router-outlet />'
})
export class AppComponent implements OnInit {
  constructor(private tfOffline: TfOfflineService) {}

  ngOnInit(): void {
    // Download + cache TF models and offline data in background
    this.tfOffline.initialize().catch(e => console.warn('[TfOffline]', e));
  }
}
