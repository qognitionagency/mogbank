output "cluster_name" {
  description = "GKE cluster name"
  value       = google_container_cluster.mogbank.name
}

output "cluster_endpoint" {
  description = "GKE cluster endpoint"
  value       = google_container_cluster.mogbank.endpoint
  sensitive   = true
}

output "cluster_ca_certificate" {
  description = "GKE cluster CA certificate"
  value       = google_container_cluster.mogbank.master_auth[0].cluster_ca_certificate
  sensitive   = true
}

output "db_connection_name" {
  description = "Cloud SQL instance connection name"
  value       = google_sql_database_instance.mogbank.connection_name
}

output "db_private_ip" {
  description = "Cloud SQL private IP address"
  value       = google_sql_database_instance.mogbank.private_ip_address
}

output "redis_host" {
  description = "Memorystore Redis host"
  value       = google_redis_instance.mogbank.host
}

output "redis_port" {
  description = "Memorystore Redis port"
  value       = google_redis_instance.mogbank.port
}

output "global_ip" {
  description = "Global IP for ingress"
  value       = google_compute_global_address.mogbank.address
}

output "artifact_registry" {
  description = "Artifact Registry repository URL"
  value       = "${var.gcp_region}-docker.pkg.dev/${var.gcp_project_id}/${google_artifact_registry_repository.mogbank.repository_id}"
}

output "service_account_email" {
  description = "GKE service account email"
  value       = google_service_account.gke.email
}

output "workload_identity_pool" {
  description = "Workload identity pool name for GitHub Actions"
  value       = google_iam_workload_identity_pool.github.name
}

output "nameservers" {
  description = "DNS nameservers"
  value       = google_dns_managed_zone.mogbank.name_servers
}