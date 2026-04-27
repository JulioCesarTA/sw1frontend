import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';

interface Company {
  id: string;
  name: string;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, MatProgressSpinnerModule],
  template: `
    <div class="mx-auto flex w-full max-w-[1400px] flex-col gap-4 px-6 py-6">
      <h2 class="text-3xl font-bold text-slate-900">Dashboard</h2>

      @if (loading()) {
        <div class="flex justify-center py-16"><mat-spinner /></div>
      } @else {
        <div class="rounded-3xl bg-white p-6 shadow-sm">
          <p class="text-lg text-slate-700">
            Bienvenido {{ userName() }} de la empresa {{ companyName() }}
          </p>
        </div>
      }
    </div>
  `
})
export class DashboardComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);

  loading = signal(true);
  companyName = signal('tu empresa');

  userName() {
    return this.auth.user()?.name || 'Usuario';
  }

  ngOnInit() {
    const companyId = this.auth.user()?.companyId;
    if (!companyId) {
      this.loading.set(false);
      return;
    }
    this.api.get<Company[]>('/companies').subscribe({
      next: companies => {
        const company = companies.find(item => item.id === companyId);
        this.companyName.set(company?.name || 'tu empresa');
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
      }
    });
  }
}
