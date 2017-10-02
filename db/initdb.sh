#!/bin/bash
psql mytype -f create-mytype-db.sql
psql mytype -f procedures.sql