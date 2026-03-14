terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

resource "aws_vpc" "this" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name = "larry-${var.environment}-vpc"
  }
}

resource "aws_subnet" "private_a" {
  vpc_id            = aws_vpc.this.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 4, 1)
  availability_zone = "${var.region}a"

  tags = {
    Name = "larry-${var.environment}-private-a"
  }
}

resource "aws_subnet" "private_b" {
  vpc_id            = aws_vpc.this.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 4, 2)
  availability_zone = "${var.region}b"

  tags = {
    Name = "larry-${var.environment}-private-b"
  }
}

resource "aws_db_subnet_group" "this" {
  name       = "larry-${var.environment}-db-subnets"
  subnet_ids = [aws_subnet.private_a.id, aws_subnet.private_b.id]
}

resource "aws_security_group" "db" {
  name        = "larry-${var.environment}-db-sg"
  description = "Postgres access"
  vpc_id      = aws_vpc.this.id

  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = var.allowed_cidr_blocks
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_db_instance" "postgres" {
  identifier             = "larry-${var.environment}-postgres"
  allocated_storage      = 50
  engine                 = "postgres"
  engine_version         = "16.3"
  instance_class         = "db.t4g.micro"
  db_name                = "larry"
  username               = var.db_username
  password               = var.db_password
  skip_final_snapshot    = true
  backup_retention_period = 7
  publicly_accessible    = false
  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [aws_security_group.db.id]
}

resource "aws_elasticache_subnet_group" "this" {
  name       = "larry-${var.environment}-cache-subnets"
  subnet_ids = [aws_subnet.private_a.id, aws_subnet.private_b.id]
}

resource "aws_security_group" "cache" {
  name        = "larry-${var.environment}-cache-sg"
  description = "Redis access"
  vpc_id      = aws_vpc.this.id

  ingress {
    from_port   = 6379
    to_port     = 6379
    protocol    = "tcp"
    cidr_blocks = var.allowed_cidr_blocks
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id       = "larry-${var.environment}-redis"
  description                = "Redis for workflow coordination"
  node_type                  = "cache.t4g.micro"
  port                       = 6379
  num_cache_clusters         = 1
  engine                     = "redis"
  engine_version             = "7.1"
  subnet_group_name          = aws_elasticache_subnet_group.this.name
  security_group_ids         = [aws_security_group.cache.id]
  automatic_failover_enabled = false
}

resource "aws_sqs_queue" "dlq" {
  name = "larry-${var.environment}-events-dlq.fifo"

  fifo_queue = true
}

resource "aws_sqs_queue" "events" {
  name                        = "larry-${var.environment}-events.fifo"
  fifo_queue                  = true
  content_based_deduplication = true
  visibility_timeout_seconds  = 60

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlq.arn
    maxReceiveCount     = 5
  })
}

resource "aws_s3_bucket" "artifacts" {
  bucket = "larry-${var.environment}-artifacts-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket_versioning" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_secretsmanager_secret" "api" {
  name = "larry/${var.environment}/api"
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/larry/${var.environment}/api"
  retention_in_days = 30
}

data "aws_caller_identity" "current" {}
