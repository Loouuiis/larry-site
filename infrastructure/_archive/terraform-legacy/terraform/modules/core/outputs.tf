output "db_endpoint" {
  value = aws_db_instance.postgres.address
}

output "events_queue_url" {
  value = aws_sqs_queue.events.url
}

output "artifact_bucket" {
  value = aws_s3_bucket.artifacts.bucket
}

output "redis_endpoint" {
  value = aws_elasticache_replication_group.redis.primary_endpoint_address
}
