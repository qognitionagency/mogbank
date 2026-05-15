terraform {
  required_version = ">= 1.5.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    github = {
      source  = "integrations/github"
      version = "~> 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5"
    }
  }

  backend "gcs" {
    bucket = "mogbank-terraform-state"
    prefix = "terraform/state"
  }
}

provider "google" {
  project = var.gcp_project_id
  region  = var.gcp_region
}

provider "github" {
  owner = "qognitionagency"
  token = var.github_token
}

# ── GKE Cluster ──
resource "google_container_cluster" "mogbank" {
  name     = "mogbank-${var.environment}"
  location = var.gcp_region

  min_master_version = "1.28"

  remove_default_node_pool = true
  initial_node_count       = 1

  network    = google_compute_network.mogbank.name
  subnetwork = google_compute_subnetwork.mogbank.name

  master_authorized_networks_config {
    cidr_blocks {
      cidr_block   = "0.0.0.0/0"
      display_name = "all"
    }
  }

  ip_allocation_policy {
    cluster_ipv4_cidr_block  = "10.100.0.0/16"
    services_ipv4_cidr_block = "10.101.0.0/16"
  }

  workload_identity_config {
    workload_pool = "${var.gcp_project_id}.svc.id.goog"
  }

  logging_config {
    enable_components = ["SYSTEM_COMPONENTS", "WORKLOADS"]
  }

  monitoring_config {
    enable_components = ["SYSTEM_COMPONENTS"]
    managed_prometheus {
      enabled = true
    }
  }
}

resource "google_container_node_pool" "mogbank" {
  name     = "mogbank-nodes-${var.environment}"
  location = var.gcp_region
  cluster  = google_container_cluster.mogbank.name

  node_count = 3

  autoscaling {
    min_node_count = 3
    max_node_count = 10
  }

  node_config {
    machine_type = "e2-standard-4"
    disk_size_gb = 100
    disk_type    = "pd-ssd"
    image_type   = "COS_CONTAINERD"

    service_account = google_service_account.gke.email
    oauth_scopes = [
      "https://www.googleapis.com/auth/cloud-platform",
    ]

    labels = {
      environment = var.environment
    }

    workload_metadata_config {
      mode = "GKE_METADATA"
    }

    shielded_instance_config {
      enable_secure_boot          = true
      enable_integrity_monitoring = true
    }
  }

  management {
    auto_repair  = true
    auto_upgrade = true
  }
}

# ── Networking ──
resource "google_compute_network" "mogbank" {
  name                    = "mogbank-${var.environment}"
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "mogbank" {
  name          = "mogbank-${var.environment}"
  network       = google_compute_network.mogbank.name
  region        = var.gcp_region
  ip_cidr_range = "10.0.0.0/16"

  private_ip_google_access = true

  secondary_ip_range {
    range_name    = "pods"
    ip_cidr_range = "10.1.0.0/16"
  }
  secondary_ip_range {
    range_name    = "services"
    ip_cidr_range = "10.2.0.0/16"
  }
}

resource "google_compute_global_address" "mogbank" {
  name = "mogbank-${var.environment}"
}

# ── Service Accounts ──
resource "google_service_account" "gke" {
  account_id   = "mogbank-gke-${var.environment}"
  display_name = "MogBank GKE Service Account"
}

resource "google_service_account" "cloudsql" {
  account_id   = "mogbank-cloudsql-${var.environment}"
  display_name = "MogBank Cloud SQL Service Account"
}

resource "google_project_iam_member" "gke" {
  for_each = toset([
    "roles/logging.logWriter",
    "roles/monitoring.metricWriter",
    "roles/monitoring.viewer",
    "roles/artifactregistry.reader",
    "roles/secretmanager.secretAccessor",
  ])
  project = var.gcp_project_id
  role    = each.key
  member  = "serviceAccount:${google_service_account.gke.email}"
}

resource "google_project_iam_member" "cloudsql" {
  role    = "roles/cloudsql.client"
  project = var.gcp_project_id
  member  = "serviceAccount:${google_service_account.cloudsql.email}"
}

# ── Cloud SQL (PostgreSQL) ──
resource "google_sql_database_instance" "mogbank" {
  name             = "mogbank-${var.environment}"
  database_version = "POSTGRES_16"
  region           = var.gcp_region

  settings {
    tier              = var.db_tier
    disk_type         = "PD_SSD"
    disk_size         = var.db_disk_size_gb
    availability_type = var.db_availability

    ip_configuration {
      ipv4_enabled    = false
      private_network = google_compute_network.mogbank.id
    }

    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = true
      start_time                     = "03:00"
      transaction_log_retention_days = 7
      backup_retention_settings {
        retained_backups = 30
      }
    }

    database_flags {
      name  = "max_connections"
      value = "500"
    }

    insights_config {
      query_insights_enabled  = true
      query_string_length     = 4096
      record_application_tags = true
    }
  }

  deletion_protection = var.environment == "production" ? true : false
}

resource "google_sql_database" "mogbank" {
  name     = "mogbank"
  instance = google_sql_database_instance.mogbank.name
}

resource "google_sql_user" "mogbank" {
  name     = "mogbank"
  instance = google_sql_database_instance.mogbank.name
  password = random_password.db.result
}

resource "random_password" "db" {
  length  = 32
  special = false
}

# ── Redis (Memorystore) ──
resource "google_redis_instance" "mogbank" {
  name           = "mogbank-${var.environment}"
  tier           = var.redis_tier
  memory_size_gb = var.redis_memory_gb
  region         = var.gcp_region

  authorized_network = google_compute_network.mogbank.id

  redis_version       = "REDIS_7_2"
  connect_mode        = "PRIVATE_SERVICE_ACCESS"
  transit_encryption_mode = "SERVER_AUTHENTICATION"

  maintenance_policy {
    weekly_maintenance_window {
      day = "SUNDAY"
      start_time {
        hours   = 4
        minutes = 0
      }
    }
  }
}

# ── Artifact Registry ──
resource "google_artifact_registry_repository" "mogbank" {
  location      = var.gcp_region
  repository_id = "mogbank"
  format        = "DOCKER"
}

# ── Secret Manager ──
resource "google_secret_manager_secret" "db_password" {
  secret_id = "mogbank-db-password-${var.environment}"
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "db_password" {
  secret      = google_secret_manager_secret.db_password.id
  secret_data = random_password.db.result
}

resource "google_secret_manager_secret" "ed25519_key" {
  secret_id = "mogbank-ed25519-key-${var.environment}"
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret" "jwt_secret" {
  secret_id = "mogbank-jwt-secret-${var.environment}"
  replication {
    auto {}
  }
}

# ── Workload Identity ──
resource "google_service_account_iam_binding" "workload_identity" {
  service_account_id = google_service_account.gke.name
  role               = "roles/iam.workloadIdentityUser"
  members = [
    "serviceAccount:${var.gcp_project_id}.svc.id.goog[mogbank/mogbank-backend]",
  ]
}

# ── GitHub Actions OIDC ──
resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "github-actions"
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-provider"

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.actor"      = "assertion.actor"
    "attribute.repository" = "assertion.repository"
  }

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account_iam_binding" "github_actions" {
  service_account_id = google_service_account.gke.name
  role               = "roles/iam.workloadIdentityUser"
  members = [
    "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/qognitionagency/mogbank",
  ]
}

# ── DNS ──
resource "google_dns_managed_zone" "mogbank" {
  name        = "mogbank-zone"
  dns_name    = "${var.domain}."
  description = "MogBank DNS zone"
}

resource "google_dns_record_set" "api" {
  name         = "api.${google_dns_managed_zone.mogbank.dns_name}"
  managed_zone = google_dns_managed_zone.mogbank.name
  type         = "A"
  ttl          = 300
  rrdatas      = [google_compute_global_address.mogbank.address]
}

resource "google_dns_record_set" "app" {
  name         = google_dns_managed_zone.mogbank.dns_name
  managed_zone = google_dns_managed_zone.mogbank.name
  type         = "A"
  ttl          = 300
  rrdatas      = [google_compute_global_address.mogbank.address]
}

# ── Cloud Armor ──
resource "google_compute_security_policy" "mogbank" {
  name = "mogbank-${var.environment}"

  rule {
    action   = "deny(403)"
    priority = "1"
    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = var.blocked_ip_ranges
      }
    }
    description = "Block known malicious IPs"
  }

  rule {
    action   = "deny(502)"
    priority = "2"
    match {
      expr {
        expression = "evaluatePreconfiguredExpr('xss-stable')"
      }
    }
    description = "XSS protection"
  }

  rule {
    action   = "deny(502)"
    priority = "3"
    match {
      expr {
        expression = "evaluatePreconfiguredExpr('sqli-stable')"
      }
    }
    description = "SQL injection protection"
  }

  rule {
    action   = "allow"
    priority = "2147483647"
    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]
      }
    }
    description = "Default allow"
  }
}

# ── Outputs ──
output "cluster_name" {
  value = google_container_cluster.mogbank.name
}

output "db_instance_connection_name" {
  value = google_sql_database_instance.mogbank.connection_name
}

output "redis_host" {
  value = google_redis_instance.mogbank.host
}

output "artifact_registry" {
  value = google_artifact_registry_repository.mogbank.repository_id
}

output "global_ip" {
  value = google_compute_global_address.mogbank.address
}