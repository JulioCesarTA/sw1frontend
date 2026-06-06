import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login.component').then(m => m.LoginComponent)
  },
  {
    path: '',
    loadComponent: () => import('./layout/shell.component').then(m => m.ShellComponent),
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      {
        path: 'dashboard',
        loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent)
      },
      {
        path: 'workflows',
        loadComponent: () => import('./features/workflows/workflow-list.component').then(m => m.WorkflowListComponent)
      },
      {
        path: 'companies',
        loadComponent: () => import('./features/companies/company-list.component').then(m => m.CompanyListComponent)
      },
      {
        path: 'departments',
        loadComponent: () => import('./features/departments/department-list.component').then(m => m.DepartmentListComponent)
      },
      {
        path: 'job-roles',
        loadComponent: () => import('./features/job-roles/job-role-list.component').then(m => m.JobRoleListComponent)
      },
      {
        path: 'workflows/:id/editor',
        loadComponent: () => import('./features/workflows/workflow-editor.component').then(m => m.WorkflowEditorComponent)
      },
      {
        path: 'tramites',
        loadComponent: () => import('./features/tramites/tramite-list.component').then(m => m.TramiteListComponent)
      },
      {
        path: 'activities',
        loadComponent: () => import('./features/activities/activities.component').then(m => m.ActivitiesComponent)
      },
      {
        path: 'workflow-assistant',
        loadComponent: () => import('./features/workflow-assistant/workflow-assistant.component').then(m => m.WorkflowAssistantComponent)
      },
      {
        path: 'tramites/:id',
        loadComponent: () => import('./features/tramites/tramite-detail.component').then(m => m.TramiteDetailComponent)
      },
      {
        path: 'users',
        loadComponent: () => import('./features/users/user-list.component').then(m => m.UserListComponent)
      },
      {
        path: 'reports',
        loadComponent: () => import('./features/reports/reports.component').then(m => m.ReportsComponent)
      },
      {
        path: 'document-audit',
        loadComponent: () => import('./features/document-audit/document-audit.component').then(m => m.DocumentAuditComponent)
      },
      {
        path: 'document-audit/diff',
        loadComponent: () => import('./features/document-audit/document-audit-diff.component').then(m => m.DocumentAuditDiffComponent)
      },
      {
        path: 'collab-docs/:id',
        loadComponent: () => import('./features/collab-docs/collab-editor.component').then(m => m.CollabEditorComponent)
      },
      {
        path: 'report-nlp',
        loadComponent: () => import('./features/reports-nlp/report-nlp.component').then(m => m.ReportNlpComponent)
      },
      {
        path: 'usuario-pide',
        loadComponent: () => import('./features/usuario-pide/usuario-pide.component').then(m => m.UsuarioPideComponent)
      },
    ]
  },
  { path: '**', redirectTo: '' }
];
