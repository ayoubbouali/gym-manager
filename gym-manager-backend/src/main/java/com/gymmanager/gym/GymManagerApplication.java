package com.gymmanager.gym;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;

import java.time.Clock;

@SpringBootApplication
public class GymManagerApplication {

	/** System clock; tests replace it with a fixed one ("today" is then deterministic). */
	@Bean
	Clock clock() {
		return Clock.systemUTC();
	}

	public static void main(String[] args) {
		SpringApplication.run(GymManagerApplication.class, args);
	}

}
