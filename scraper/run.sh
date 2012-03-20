#! /bin/bash

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

java -classpath $DIR/bin:$DIR/lib/jsoup-1.6.1.jar:$DIR/lib/gson-2.1.jar ClassScraper