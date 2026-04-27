import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { AuthService } from '../core/services/auth.service';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [
    RouterOutlet, RouterLink, RouterLinkActive, CommonModule,
    MatToolbarModule, MatSidenavModule, MatListModule, MatIconModule,
    MatButtonModule, MatMenuModule
  ],
  template: `
    <mat-sidenav-container class="h-screen bg-slate-100">
      <mat-sidenav mode="side" opened class="w-[260px] border-r border-slate-800 bg-slate-900 text-white">
        <div class="flex h-full flex-col">
          <div class="flex items-center gap-3 border-b border-white/10 px-4 py-5 text-base font-bold">
            <mat-icon class="text-indigo-500">account_tree</mat-icon>
            <span>Workflow Manager</span>
          </div>

          <mat-nav-list class="flex-1 pt-2">
            <a mat-list-item routerLink="/dashboard" routerLinkActive="bg-indigo-500/20 text-white"
              class="mx-2 my-1 rounded-xl text-white/70 transition hover:bg-white/10 hover:text-white">
              <mat-icon matListItemIcon>dashboard</mat-icon>
              <span matListItemTitle>Dashboard</span>
            </a>
            <a mat-list-item routerLink="/workflows" routerLinkActive="bg-indigo-500/20 text-white"
              class="mx-2 my-1 rounded-xl text-white/70 transition hover:bg-white/10 hover:text-white">
              <mat-icon matListItemIcon>account_tree</mat-icon>
              <span matListItemTitle>Workflows</span>
            </a>
            <a mat-list-item routerLink="/tramites" routerLinkActive="bg-indigo-500/20 text-white"
              class="mx-2 my-1 rounded-xl text-white/70 transition hover:bg-white/10 hover:text-white">
              <mat-icon matListItemIcon>description</mat-icon>
              <span matListItemTitle>Tramites</span>
            </a>
            <a mat-list-item routerLink="/activities" routerLinkActive="bg-indigo-500/20 text-white"
              class="mx-2 my-1 rounded-xl text-white/70 transition hover:bg-white/10 hover:text-white">
              <mat-icon matListItemIcon>assignment</mat-icon>
              <span matListItemTitle>Actividades</span>
            </a>
            @if (auth.isSuperAdmin()) {
              <a mat-list-item routerLink="/companies" routerLinkActive="bg-indigo-500/20 text-white"
                class="mx-2 my-1 rounded-xl text-white/70 transition hover:bg-white/10 hover:text-white">
                <mat-icon matListItemIcon>apartment</mat-icon>
                <span matListItemTitle>Empresas</span>
              </a>
            }
            @if (auth.isAdmin()) {
              <a mat-list-item routerLink="/departments" routerLinkActive="bg-indigo-500/20 text-white"
                class="mx-2 my-1 rounded-xl text-white/70 transition hover:bg-white/10 hover:text-white">
                <mat-icon matListItemIcon>business_center</mat-icon>
                <span matListItemTitle>Departamentos</span>
              </a>
              <a mat-list-item routerLink="/job-roles" routerLinkActive="bg-indigo-500/20 text-white"
                class="mx-2 my-1 rounded-xl text-white/70 transition hover:bg-white/10 hover:text-white">
                <mat-icon matListItemIcon>badge</mat-icon>
                <span matListItemTitle>Gestionar roles</span>
              </a>
              <a mat-list-item routerLink="/users" routerLinkActive="bg-indigo-500/20 text-white"
                class="mx-2 my-1 rounded-xl text-white/70 transition hover:bg-white/10 hover:text-white">
                <mat-icon matListItemIcon>people</mat-icon>
                <span matListItemTitle>Usuarios</span>
              </a>
              <a mat-list-item routerLink="/reports" routerLinkActive="bg-indigo-500/20 text-white"
                class="mx-2 my-1 rounded-xl text-white/70 transition hover:bg-white/10 hover:text-white">
                <mat-icon matListItemIcon>bar_chart</mat-icon>
                <span matListItemTitle>Reportes</span>
              </a>
            }
          </mat-nav-list>

          <div class="flex items-center justify-between border-t border-white/10 px-4 py-3">
            <div class="flex items-center gap-2">
              <mat-icon class="text-white/50">person</mat-icon>
              <div>
                <p class="text-sm font-semibold text-black">{{ auth.user()?.name || auth.user()?.email }}</p>
                <p class="text-xs text-black/50">{{ auth.user()?.jobRoleName || auth.user()?.role }}</p>
              </div>
            </div>
            <button mat-icon-button (click)="auth.logout()" title="Cerrar sesión" class="text-white/50">
              <mat-icon>logout</mat-icon>
            </button>
          </div>
        </div>
      </mat-sidenav>

      <mat-sidenav-content class="overflow-y-auto bg-slate-100">
        <router-outlet />
      </mat-sidenav-content>
    </mat-sidenav-container>
  `
})
export class ShellComponent {
  auth = inject(AuthService);
}
