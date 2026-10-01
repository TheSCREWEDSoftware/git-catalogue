import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { HomeComponent } from './home/home.component';
import { HowtoComponent } from './howto/howto.component';
import { RepoDetailsComponent } from './repo-details/repo-details.component';
import { RepoDetailsResolverService } from './services/resolvers/repo-details-resolver.service';

const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'home', component: HomeComponent },
  { path: 'tab/:tab', component: HomeComponent },
  {
    path: 'details/:id',
    component: RepoDetailsComponent,
    resolve: { data: RepoDetailsResolverService },
    runGuardsAndResolvers: 'paramsChange'
  },
  {
    // Same target as above; the trailing :name segment is a readable-URL
    // convenience only (e.g. /details/646926161/mod-playerbots) and is never
    // read by the resolver, which only cares about the numeric :id.
    path: 'details/:id/:name',
    component: RepoDetailsComponent,
    resolve: { data: RepoDetailsResolverService },
    runGuardsAndResolvers: 'paramsChange'
  },
  { path: 'how-to', component: HowtoComponent },
];

@NgModule({
  imports: [RouterModule.forRoot(routes, { useHash: true })],
  exports: [RouterModule],
})
export class AppRoutingModule {}
